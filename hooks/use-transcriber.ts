// hooks/use-transcriber.ts
import { useCallback, useMemo, useState, useEffect } from 'react'
import { useWorker } from '@/hooks/use-worker'
import { Transcriber, TranscriberData, WhisperModel } from '@/lib/types'
import { useTiming } from '@/contexts/timing-context'

export function useTranscriber(): Transcriber {
    const { markStart, markEnd } = useTiming()
    const [output, setOutput] = useState<TranscriberData | undefined>()
    const [isProcessing, setIsProcessing] = useState(false)
    const [isModelLoading, setIsModelLoading] = useState(false)
    const [modelLoadingProgress, setModelLoadingProgress] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const webWorker = useWorker(event => {
        const message = event.data

        switch (message.status) {
            case 'progress':
                setModelLoadingProgress(message.progress)
                break
            case 'update':
                // Optional: handle partial/streaming results here
                break
            case 'complete':
                setOutput(message.data)
                setIsProcessing(false)
                markEnd('transcribe-audio', 'Transcribe the audio')
                break
            case 'initiate':
                setIsModelLoading(true)
                markStart('download-model')
                break
            case 'ready':
                setIsModelLoading(false)
                markEnd('download-model', 'Download the model')
                break
            case 'warmup-complete':
                console.debug(
                    `[useTranscriber] Warmed up ${message.model} in ${Math.round(message.elapsedMs)}ms`
                )
                break
            case 'error':
                console.error('[useTranscriber] Worker error:', message.data)
                setError(message.data)
                setIsProcessing(false)
                setIsModelLoading(false)
                break
            case 'done':
                break
            default:
                break
        }
    })

    useEffect(() => {
        if (webWorker) {
            webWorker.postMessage({
                action: 'load',
                model: 'onnx-community/lite-whisper-large-v3-turbo-ONNX'
            })
            webWorker.postMessage({
                action: 'load',
                model: 'Xenova/whisper-tiny.en'
            })
        }
    }, [webWorker])

    const onInputChange = useCallback(() => {
        setOutput(undefined)
        setError(null)
    }, [])

    const start = useCallback(
        async (audioData: AudioBuffer | undefined, model?: WhisperModel, language: string = 'en') => {
            if (audioData) {
                setOutput(undefined)
                setError(null) // clear any previous error before each new transcription
                setIsProcessing(true)
                markStart('transcribe-audio')

                let audio: Float32Array
                if (audioData.numberOfChannels === 2) {
                    const SCALING_FACTOR = Math.sqrt(2)
                    const left = audioData.getChannelData(0)
                    const right = audioData.getChannelData(1)
                    audio = new Float32Array(left.length)
                    for (let i = 0; i < audioData.length; ++i) {
                        audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2
                    }
                } else {
                    audio = audioData.getChannelData(0)
                }

                webWorker?.postMessage(
                    { audio, model, language },
                    [audio.buffer]
                )
            }
        },
        [webWorker]
    )

    const transcriber = useMemo(
        () => ({
            onInputChange,
            isProcessing,
            isModelLoading,
            modelLoadingProgress,
            start,
            output,
            error,
        }),
        [onInputChange, isProcessing, isModelLoading, modelLoadingProgress, start, output, error]
    )

    return transcriber
}