// lib/worker.js
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

env.backends.onnx.wasm.simd = true
if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    env.backends.onnx.wasm.numThreads = Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1))
}

env.backends.onnx.logLevel = 'fatal';

const getDevice = async () => {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'cpu'
    try {
        const adapter = await navigator.gpu.requestAdapter()
        return adapter ? 'webgpu' : 'cpu'
    } catch {
        return 'cpu'
    }
}

const devicePromise = getDevice()

const buildTranscribeOptions = (model, language, audioDurationSeconds, overrides = {}) => {
    const options = {
        // Limit beam search (1 = greedy [fastest], 2 = your suggestion [accurate])
        // HF Transformers uses `num_beams` instead of `beam_size`
        num_beams: 2,
        condition_on_previous_text: false,
        // Skip predicting timestamps (massive speedup)
        return_timestamps: false,
    }

    if (audioDurationSeconds > 30) {
        options.chunk_length_s = 30
        options.stride_length_s = 5
    }

    // English-only models: don't pass language/task
    if (!model.endsWith('.en')) {
        // For ONNX models, skip language/task to avoid tokenizer issues
        if (model.includes('onnx-community')) {
            // No language, no task -> model auto-detects
            options.num_beams = 1
            // Force temperature to 0.0 (Greedy search, disables fallback generation loops)
            options.temperature = 0.0
            // REPETITION PENALTY: Whisper often hallucinates by repeating the
            // same word (e.g., "The the the"). This penalizes repetition,
            // forcing the model to output the <|endoftext|> token and shut down instantly.
            options.repetition_penalty = 1.2
            // SILENCE ABORT: If the user stops speaking, tell Whisper to give up
            // instead of trying to transcribe room noise.
            options.no_speech_threshold = 0.6
        } else {
            // For Xenova models (non-ONNX), pass language/task as before
            options.language = language || 'en'
            options.task = 'transcribe'
            options.is_multilingual = true
        }
    }

    return { ...options, ...overrides }
}

const WARMUP_SAMPLE_RATE = 16000
const WARMUP_DURATION_S = 1
const WARMUP_MIN_TOKENS = 8
const WARMUP_MAX_TOKENS = 12

const WARMUP_AUDIO = (() => {
    const samples = new Float32Array(WARMUP_SAMPLE_RATE * WARMUP_DURATION_S)
    for (let i = 0; i < samples.length; i++) {
        samples[i] = (Math.random() - 0.5) * 0.05
    }
    return samples
})()

const warmupModel = async (model, instance) => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const start = now()

    try {
        const options = buildTranscribeOptions(model, 'en', WARMUP_DURATION_S, {
            // Force real multi-step decoding so the KV-cache growth path
            // actually gets exercised, but keep it bounded/fast.
            min_new_tokens: WARMUP_MIN_TOKENS,
            max_new_tokens: WARMUP_MAX_TOKENS,
            // Never let "looks like silence" logic skip generation during
            // warm-up — that defeats the whole point. (Only relevant for
            // the onnx-community branch, harmless elsewhere.)
            no_speech_threshold: 1.0,
        })

        await instance(WARMUP_AUDIO, options)
        self.postMessage({ status: 'warmup-complete', model, elapsedMs: now() - start })
    } catch (err) {
        // A failed dry run should never invalidate a perfectly good,
        // already-downloaded model — just skip the optimization this time.
        console.warn(`[worker] Warm-up dry run failed for ${model}:`, err?.message || err)
    }
}

class PipelineFactory {
    static task = null
    static instances = new Map()

    static async getInstance(model, progress_callback = null) {
        const key = `${this.task}-${model}`

        if (!this.instances.has(key)) {
            const device = await devicePromise

            const pipelineOptions = {
                progress_callback,
                device,
            }

            if (model.includes('onnx-community')) {
                pipelineOptions.dtype = "fp16"
            }

            const instancePromise = (async () => {
                const instance = await pipeline(this.task, model, pipelineOptions)
                // Run the silent dry run right here — before this promise
                // (and therefore getInstance/'ready') resolves.
                await warmupModel(model, instance)
                return instance
            })().catch(async (err) => {
                // Don't leave a permanently-failed promise cached —
                // let the next attempt retry the network request.
                this.instances.delete(key)

                try {
                    if (typeof caches !== 'undefined') {
                        const keys = await caches.keys()
                        for (const cacheKey of keys) {
                            if (cacheKey.includes('transformers')) {
                                await caches.delete(cacheKey)
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Failed to clear caches", e)
                }

                throw err
            })

            this.instances.set(key, instancePromise)
        }

        return this.instances.get(key)
    }
}

class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
    static task = 'automatic-speech-recognition'
}

// Loads are serialized so preloading two models at startup doesn't make
// them fight over bandwidth/CPU or interleave progress reporting.
let loadQueue = Promise.resolve()

const loadModel = async (model) => {
    self.postMessage({ status: 'initiate', model })
    try {
        await AutomaticSpeechRecognitionPipelineFactory.getInstance(
            model,
            data => self.postMessage(data)
        )
        self.postMessage({ status: 'ready', model })
    } catch (error) {
        self.postMessage({
            status: 'error',
            task: 'automatic-speech-recognition',
            data: error.message || String(error),
        })
    }
}

self.addEventListener('message', async event => {
    const message = event.data

    if (message.action === 'load') {
        loadQueue = loadQueue.then(() => loadModel(message.model))
        return
    }

    if (message.audio) {
        const transcript = await transcribe(message.audio, message.model, message.language)
        if (transcript === null) return

        self.postMessage({
            status: 'complete',
            task: 'automatic-speech-recognition',
            data: transcript,
        })
    }
})

const transcribe = async (audio, model, language) => {
    const resolvedModel = model || 'Xenova/whisper-tiny.en'

    try {
        const transcriber = await AutomaticSpeechRecognitionPipelineFactory.getInstance(
            resolvedModel,
            data => self.postMessage(data)
        )

        const audioDurationSeconds = audio.length / 16000
        const options = buildTranscribeOptions(resolvedModel, language, audioDurationSeconds)

        return await transcriber(audio, options)
    } catch (error) {
        self.postMessage({
            status: 'error',
            task: 'automatic-speech-recognition',
            data: error.message || String(error),
        })
        return null
    }
}