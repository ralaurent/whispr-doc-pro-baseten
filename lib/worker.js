// lib/worker.js
import { pipeline, env } from '@huggingface/transformers'
import { isMobileDevice } from './utils'

env.allowLocalModels = false

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

            const instancePromise = pipeline(this.task, model, {
                progress_callback,
                device,
            }).catch((err) => {
                // Don't leave a permanently-failed promise cached —
                // let the next attempt retry the network request.
                this.instances.delete(key)
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
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: false,
        }

        // English-only models: don't pass language/task
        if (!resolvedModel.endsWith('.en')) {
            // For ONNX models, skip language/task to avoid tokenizer issues
            if (resolvedModel.includes('onnx-community')) {
                // No language, no task → model auto‑detects
                // You can still set is_multilingual if you want, but it's not required
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