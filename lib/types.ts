export type WhisperModel = 'Xenova/whisper-tiny.en' | 'Xenova/whisper-small.en'

export interface TranscriberData {
    text: string
}

export interface Transcriber {
    onInputChange: () => void
    isProcessing: boolean
    isModelLoading: boolean
    modelLoadingProgress: number
    start: (audioData: AudioBuffer | undefined, model?: WhisperModel, language?: string) => Promise<void>
    output: TranscriberData | undefined
    error: string | null
}