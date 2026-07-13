// lib/worker.js
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

env.backends.onnx.wasm.simd = true
if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    // CRITICAL FIX: Cap threads at 4. 
    // WASM memory bandwidth chokes if you use more than 4 threads, slowing it down.
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

            const instancePromise = pipeline(this.task, model, pipelineOptions).catch(async (err) => {
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

self.addEventListener('message', async event => {
    const message = event.data

    if (message.action === 'load') {
        self.postMessage({ status: 'initiate' })
        try {
            await AutomaticSpeechRecognitionPipelineFactory.getInstance(
                message.model,
                data => self.postMessage(data)

            )
            self.postMessage({ status: 'ready' })
        } catch (error) {
            self.postMessage({
                status: 'error',
                task: 'automatic-speech-recognition',
                data: error.message || String(error),
            })
        }
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

        const options = {
            // Limit beam search (1 = greedy [fastest], 2 = your suggestion [accurate])
            // HF Transformers uses `num_beams` instead of `beam_size`
            num_beams: 2,
            condition_on_previous_text: false,
            // Skip predicting timestamps (massive speedup)
            return_timestamps: false,
        }

        const audioDurationSeconds = audio.length / 16000;
        if (audioDurationSeconds > 30) {
            options.chunk_length_s = 30;
            options.stride_length_s = 5;
        }

        // English-only models: don't pass language/task
        if (!resolvedModel.endsWith('.en')) {
            // For ONNX models, skip language/task to avoid tokenizer issues
            if (resolvedModel.includes('onnx-community')) {
                // No language, no task → model auto‑detects
                // You can still set is_multilingual if you want, but it's not required
                // Disable context conditioning (stops hallucination loops & speeds up processing)
                // options.condition_on_previous_text = false
                // Limit beam search (1 = greedy [fastest], 2 = your suggestion [accurate])
                // HF Transformers uses `num_beams` instead of `beam_size`
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
                // For Xenova models (non‑ONNX), pass language/task as before
                options.language = language || 'en'
                options.task = 'transcribe'
                options.is_multilingual = true
            }
        }

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

