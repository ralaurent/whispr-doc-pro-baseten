"use client"

import { useState, useRef, useEffect } from "react"
import { Mic, X, Check, Loader2, Ellipsis, Search, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuPortal,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { AudioVisualizer } from "./audio-visualizer"
import { cn } from "@/lib/utils"
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import { useTranscriber } from '@/hooks/use-transcriber'

const LANGUAGES = [
    { code: "en", name: "English", speechLang: "en-US" },
    { code: "es", name: "Spanish", speechLang: "es-ES" },
    { code: "it", name: "Italian", speechLang: "it-IT" },
    { code: "de", name: "German", speechLang: "de-DE" },
    { code: "pt", name: "Portuguese", speechLang: "pt-BR" },
    { code: "fr", name: "French", speechLang: "fr-FR" },
    { code: "ja", name: "Japanese", speechLang: "ja-JP" },
    { code: "nl", name: "Dutch", speechLang: "nl-NL" },
    { code: "pl", name: "Polish", speechLang: "pl-PL" },
    { code: "ru", name: "Russian", speechLang: "ru-RU" },
    { code: "ko", name: "Korean", speechLang: "ko-KR" },
    { code: "ca", name: "Catalan", speechLang: "ca-ES" },
    { code: "sv", name: "Swedish", speechLang: "sv-SE" },
    { code: "tr", name: "Turkish", speechLang: "tr-TR" },
    { code: "id", name: "Indonesian", speechLang: "id-ID" },
    { code: "no", name: "Norwegian", speechLang: "nb-NO" },
    { code: "fi", name: "Finnish", speechLang: "fi-FI" },
    { code: "vi", name: "Vietnamese", speechLang: "vi-VN" },
    { code: "da", name: "Danish", speechLang: "da-DK" },
    { code: "he", name: "Hebrew", speechLang: "he-IL" },
    { code: "cs", name: "Czech", speechLang: "cs-CZ" },
    { code: "hu", name: "Hungarian", speechLang: "hu-HU" },
    { code: "ro", name: "Romanian", speechLang: "ro-RO" },
    { code: "el", name: "Greek", speechLang: "el-GR" },
    { code: "ar", name: "Arabic", speechLang: "ar-SA" },
    { code: "uk", name: "Ukrainian", speechLang: "uk-UA" },
    { code: "tl", name: "Tagalog", speechLang: "fil-PH" },
    { code: "ms", name: "Malay", speechLang: "ms-MY" },
    { code: "th", name: "Thai", speechLang: "th-TH" },
    { code: "hi", name: "Hindi", speechLang: "hi-IN" },
]

interface AudioRecorderProps {
    onTranscript?: (text: string) => void;
    mode?: "web-speech" | "whisper-tiny" | "whisper-large";
    isLoading?: boolean;
}

export function AudioRecorder({ onTranscript, mode = "web-speech", isLoading = false }: AudioRecorderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [transcriptionMode, setTranscriptionMode] = useState<"web-speech" | "whisper-tiny" | "whisper-large">(mode as any)
    const [language, setLanguage] = useState<string>("en")
    const [langSearch, setLangSearch] = useState("")
    const [audioFile, setAudioFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null)
    const [isRecordingWhisper, setIsRecordingWhisper] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const [isFinalizing, setIsFinalizing] = useState(false)

    const transcriptRef = useRef("");

    const transcriber = useTranscriber()

    const {
        transcript: webSpeechTranscript,
        resetTranscript: resetWebSpeech,
        listening: isRecordingWebSpeech
    } = useSpeechRecognition()

    const isRecording = transcriptionMode === "web-speech" ? isRecordingWebSpeech : isRecordingWhisper;
    const isTranscribing = transcriptionMode === "web-speech" ? false : transcriber.isProcessing;

    const isBusy = isFinalizing || isTranscribing;

    const shouldProcessOutput = useRef(false)

    useEffect(() => {
        transcriptRef.current = webSpeechTranscript;
    }, [webSpeechTranscript]);

    useEffect(() => {
        if (transcriber.output && shouldProcessOutput.current) {
            const whisperText = typeof transcriber.output === 'string'
                ? transcriber.output
                : (transcriber.output as any).text || JSON.stringify(transcriber.output);

            console.log(`Model: ${transcriptionMode} (${language})`, whisperText);

            if (onTranscript) onTranscript(whisperText)

            shouldProcessOutput.current = false
            setIsOpen(false)
        }
    }, [transcriber.output, onTranscript, transcriptionMode, language])

    useEffect(() => {
        if (!isOpen) {
            stopAllStreams()
            setLangSearch("")
            setIsFinalizing(false)
        }
    }, [isOpen])

    const stopAllStreams = () => {
        if (visualizerStream) {
            visualizerStream.getTracks().forEach(track => track.stop())
            setVisualizerStream(null)
        }
        if (isRecordingWebSpeech) {
            SpeechRecognition.stopListening()
        }
        if (isRecordingWhisper) {
            mediaRecorderRef.current?.stop()
            setIsRecordingWhisper(false)
        }
    }

    const startRecordingFn = async (currentMode = transcriptionMode, currentLang = language) => {
        try {
            transcriber.onInputChange()
            setIsFinalizing(false)

            if (currentMode === "web-speech") {
                resetWebSpeech()
                const selectedLangObj = LANGUAGES.find(l => l.code === currentLang)
                SpeechRecognition.startListening({
                    continuous: true,
                    language: selectedLangObj?.speechLang || "en-US"
                })
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            setVisualizerStream(stream)

            if (currentMode !== "web-speech") {
                chunksRef.current = []
                const mediaRecorder = new MediaRecorder(stream)

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data)
                }

                mediaRecorder.start()
                mediaRecorderRef.current = mediaRecorder
                setIsRecordingWhisper(true)
            }
        } catch (err) {
            console.error("Error accessing microphone:", err)
        }
    }

    const handlePopoverOpenChange = (open: boolean) => {
        if (open) {
            setIsOpen(true)
            startRecordingFn()
        } else {
            if (isBusy) return;
            handleCancel()
        }
    }

    const handleCancel = () => {
        if (isBusy) return;
        stopAllStreams()
        if (transcriptionMode === "web-speech") resetWebSpeech()
        setIsOpen(false)
    }

    const handleConfirm = async () => {
        if (transcriptionMode === "web-speech") {
            setIsFinalizing(true)
            SpeechRecognition.stopListening()

            setTimeout(() => {
                const finalTranscript = transcriptRef.current;
                console.log(`Model: ${transcriptionMode} (${language})`, finalTranscript);

                if (onTranscript) onTranscript(finalTranscript)

                stopAllStreams()
                setIsFinalizing(false)
                setIsOpen(false)
            }, 750)
        } else {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                setIsFinalizing(true)
                mediaRecorderRef.current.stop()

                mediaRecorderRef.current.onstop = async () => {
                    setIsRecordingWhisper(false)
                    stopAllStreams()

                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

                    try {
                        const arrayBuffer = await blob.arrayBuffer()
                        const audioContext = new AudioContext({ sampleRate: 16000 })
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

                        shouldProcessOutput.current = true;

                        let model: string;
                        if (transcriptionMode === 'whisper-tiny') {
                            model = language === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny';
                        } else {
                            model = 'onnx-community/lite-whisper-large-v3-turbo-ONNX';
                        }

                        transcriber.start(audioBuffer, model as any, language)
                        setIsFinalizing(false)
                    } catch (e) {
                        console.error("Error decoding audio data", e)
                        setIsFinalizing(false)
                    }
                }
            }
        }
    }

    const handleLanguageChange = (newLang: string) => {
        setLanguage(newLang);
        if (isRecording) {
            stopAllStreams();
            startRecordingFn(transcriptionMode, newLang);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsFinalizing(true)
            setAudioFile(file);

            let currentMode = transcriptionMode;
            if (currentMode === "web-speech") {
                currentMode = "whisper-tiny";
                setTranscriptionMode("whisper-tiny");
            }

            stopAllStreams();

            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioContext = new AudioContext({ sampleRate: 16000 });
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                shouldProcessOutput.current = true;

                let model: string;
                if (currentMode === 'whisper-tiny') {
                    model = language === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny';
                } else {
                    model = 'onnx-community/lite-whisper-large-v3-turbo-ONNX';
                }

                transcriber.start(audioBuffer, model as any, language);
                setIsFinalizing(false)
            } catch (error) {
                console.error("Error decoding audio data", error);
                setIsFinalizing(false)
            }
        }
    };

    const loadingMessage = transcriber.isModelLoading
        ? `Loading Model... ${Math.round(transcriber.modelLoadingProgress || 0)}%`
        : transcriber.isProcessing
            ? "Transcribing..."
            : "Finishing up...";

    const filteredLanguages = LANGUAGES.filter(l =>
        l.name.toLowerCase().includes(langSearch.toLowerCase())
    )

    return (
        <Popover open={isOpen} onOpenChange={handlePopoverOpenChange}>
            <PopoverTrigger asChild>
                <div className="relative">
                    <button className={cn("flex h-8 w-8 items-center justify-center rounded hover:bg-muted", isOpen ? "bg-blue-50 text-blue-500" : "text-muted-foreground hover:text-foreground")}>
                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                        ) : <Mic className="h-4 w-4" />}
                    </button>
                </div>
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="center"
                className="w-auto p-0 border-none bg-transparent shadow-none focus:outline-none mb-2"
                onEscapeKeyDown={(e) => { if (isBusy) e.preventDefault() }}
                onPointerDownOutside={(e) => { if (isBusy) e.preventDefault() }}
                onInteractOutside={(e) => { if (isBusy) e.preventDefault() }}
            >
                <div className="flex items-center gap-2 h-14 pl-4 pr-2 bg-white rounded-full border border-border shadow-xl w-[320px]">
                    <div className="flex-1 overflow-hidden h-full flex items-center justify-center relative">
                        {visualizerStream && isRecording && !isBusy && (
                            <div className="w-full h-[30px] flex items-center justify-center overflow-hidden scale-x-[-1]">
                                <AudioVisualizer
                                    stream={visualizerStream}
                                    width={220}
                                    height={30}
                                    barColor="#000000"
                                    gap={2}
                                />
                            </div>
                        )}

                        {isBusy && (
                            <div className="absolute inset-x-0 inset-y-0 bg-white/80 flex items-center justify-center rounded-full z-10 gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="text-xs font-medium">
                                    {loadingMessage}
                                </span>
                            </div>
                        )}

                        {!isBusy && !isRecording && transcriber.error && (
                            <div className="text-[11px] text-red-500 px-2 text-center leading-tight">
                                Transcription failed — {transcriber.error}. Try again.
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1 pl-2 border-l border-gray-100 shrink-0">
                        <DropdownMenu modal={true}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-gray-100 hover:text-gray-600"
                                    disabled={isBusy}
                                >
                                    <Ellipsis className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[280px] p-2">
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                    Audio Source
                                </DropdownMenuLabel>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="audio/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        fileInputRef.current?.click();
                                    }}
                                    className="flex items-center justify-between py-2 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                >
                                    <div className="flex items-center gap-2 max-w-[200px]">
                                        <Upload className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium text-sm truncate">
                                            {audioFile ? audioFile.name : "Inject Pre-recorded Audio"}
                                        </span>
                                    </div>
                                    {audioFile && (
                                        <X
                                            className="h-4 w-4 text-muted-foreground hover:text-red-500 shrink-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAudioFile(null);
                                                if (isOpen) { stopAllStreams(); startRecordingFn(); }
                                            }}
                                        />
                                    )}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="my-2" />
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                    Language
                                </DropdownMenuLabel>

                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger
                                        className="flex items-center justify-between py-2 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                    >
                                        <span className="font-medium text-sm">
                                            {LANGUAGES.find(l => l.code === language)?.name || "Select Language"}
                                        </span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="w-56 p-0 flex flex-col max-h-[300px]">
                                            <div className="flex items-center border-b px-3 sticky top-0 bg-popover z-10">
                                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                                <input
                                                    className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                    placeholder="Search language..."
                                                    value={langSearch}
                                                    onChange={(e) => setLangSearch(e.target.value)}
                                                    onKeyDownCapture={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="overflow-y-auto p-1 flex-1">
                                                {filteredLanguages.length === 0 ? (
                                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                                        No language found.
                                                    </div>
                                                ) : (
                                                    filteredLanguages.map(lang => (
                                                        <DropdownMenuItem
                                                            key={lang.code}
                                                            onSelect={(e) => {
                                                                e.preventDefault();
                                                                handleLanguageChange(lang.code);
                                                            }}
                                                            className="flex items-center justify-between cursor-pointer"
                                                        >
                                                            {lang.name}
                                                            {language === lang.code && <Check className="h-4 w-4 text-primary" />}
                                                        </DropdownMenuItem>
                                                    ))
                                                )}
                                            </div>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>

                                <DropdownMenuSeparator className="my-2" />

                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                    Model
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        stopAllStreams();
                                        if (transcriptionMode === "web-speech") resetWebSpeech();
                                        setTranscriptionMode("web-speech");
                                        startRecordingFn("web-speech", "en");
                                    }}
                                    className="flex items-center justify-between py-3 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                >
                                    <div className="flex flex-col text-left">
                                        <span className="font-semibold text-sm">Web Speech API</span>
                                        <span className="text-xs text-muted-foreground mt-0.5">Instant</span>
                                    </div>
                                    {transcriptionMode === "web-speech" && <Check className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        stopAllStreams();
                                        setTranscriptionMode("whisper-tiny");
                                        startRecordingFn("whisper-tiny");
                                    }}
                                    className="flex items-center justify-between py-3 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                >
                                    <div className="flex flex-col text-left gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">Whisper Tiny</span>
                                            {language === 'en' && (
                                                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px] px-1.5 h-4 font-bold">
                                                    Recommended
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Fast</span>
                                        </div>
                                    </div>
                                    {transcriptionMode === "whisper-tiny" && <Check className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        stopAllStreams();
                                        setTranscriptionMode("whisper-large");
                                        startRecordingFn("whisper-large");
                                    }}
                                    className="flex items-center justify-between py-3 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                >
                                    <div className="flex flex-col text-left gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm">Whisper Large v3 Turbo</span>
                                            {language !== 'en' && (
                                                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px] px-1.5 h-4 font-bold">
                                                    Recommended
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Slower • More accurate</span>
                                        </div>
                                    </div>
                                    {transcriptionMode === "whisper-large" && <Check className="h-4 w-4 text-primary" />}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-red-50 hover:text-red-600"
                            onClick={handleCancel}
                            disabled={isBusy}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-green-50 hover:text-green-600"
                            onClick={handleConfirm}
                            disabled={isBusy || (transcriptionMode !== "web-speech" && !isRecording)}
                        >
                            {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
