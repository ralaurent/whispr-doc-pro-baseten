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
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "it", name: "Italian" },
    { code: "de", name: "German" },
    { code: "pt", name: "Portuguese" },
    { code: "fr", name: "French" },
    { code: "ja", name: "Japanese" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "ru", name: "Russian" },
    { code: "ko", name: "Korean" },
    { code: "ca", name: "Catalan" },
    { code: "sv", name: "Swedish" },
    { code: "tr", name: "Turkish" },
    { code: "id", name: "Indonesian" },
    { code: "no", name: "Norwegian" },
    { code: "fi", name: "Finnish" },
    { code: "vi", name: "Vietnamese" },
    { code: "da", name: "Danish" },
    { code: "he", name: "Hebrew" },
    { code: "cs", name: "Czech" },
    { code: "hu", name: "Hungarian" },
    { code: "ro", name: "Romanian" },
    { code: "el", name: "Greek" },
    { code: "ar", name: "Arabic" },
    { code: "uk", name: "Ukrainian" },
    { code: "tl", name: "Tagalog" },
    { code: "ms", name: "Malay" },
    { code: "th", name: "Thai" },
    { code: "hi", name: "Hindi" }
]

interface AudioRecorderProps {
    onTranscript?: (text: string) => void;
    mode?: "web-speech" | "whisper-tiny" | "whisper-large";   // changed type
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

    const transcriptRef = useRef("");

    const transcriber = useTranscriber()

    const {
        transcript: webSpeechTranscript,
        resetTranscript: resetWebSpeech,
        listening: isRecordingWebSpeech
    } = useSpeechRecognition()

    const isRecording = transcriptionMode === "web-speech" ? isRecordingWebSpeech : isRecordingWhisper;
    const isProcessing = transcriptionMode === "web-speech" ? false : (transcriber.isProcessing || transcriber.isModelLoading);

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
            setLangSearch("") // Reset search when closed
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
            if (currentMode === "web-speech") {
                resetWebSpeech()
                SpeechRecognition.startListening({
                    continuous: true,
                    language: "en-US" // Web-speech locked to English per requirements
                })
            }

            // 1. Get Microphone Stream (For visualizer & Whisper)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            setVisualizerStream(stream)

            if (currentMode !== "web-speech") {
                // 2. Setup MediaRecorder solely for Whisper
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
            if (isProcessing) return;
            handleCancel()
        }
    }

    const handleCancel = () => {
        stopAllStreams()
        if (transcriptionMode === "web-speech") resetWebSpeech()
        setIsOpen(false)
    }

    const handleConfirm = async () => {
        if (transcriptionMode === "web-speech") {
            SpeechRecognition.stopListening()

            setTimeout(() => {
                const finalTranscript = transcriptRef.current;
                console.log(`Model: ${transcriptionMode} (${language})`, finalTranscript);

                if (onTranscript) onTranscript(finalTranscript)

                stopAllStreams()
                setIsOpen(false)
            }, 750)
        } else {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
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

                        // Determine model based on selected mode and language
                        let model: string;
                        if (transcriptionMode === 'whisper-tiny') {
                            model = language === 'en' ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny';
                        } else { // whisper-large
                            model = 'onnx-community/lite-whisper-large-v3-turbo-ONNX'; // multilingual only
                        }

                        transcriber.start(audioBuffer, model as any, language)
                    } catch (e) {
                        console.error("Error decoding audio data", e)
                    }
                }
            }
        }
    }

    const handleLanguageChange = (newLang: string) => {
        setLanguage(newLang);
        // If web-speech was active, it's strictly english, so we only restart if in whisper modes
        if (transcriptionMode !== "web-speech" && isRecordingWhisper) {
            stopAllStreams();
            startRecordingFn(transcriptionMode, newLang);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
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
                } else { // whisper-large
                    model = 'onnx-community/lite-whisper-large-v3-turbo-ONNX';
                }

                transcriber.start(audioBuffer, model as any, language);
            } catch (error) {
                console.error("Error decoding audio data", error);
            }
        }
    };

    const loadingMessage = transcriber.isModelLoading
        ? `Loading Model... ${Math.round(transcriber.modelLoadingProgress || 0)}%`
        : "Transcribing...";

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
            >
                <div className="flex items-center gap-2 h-14 pl-4 pr-2 bg-white rounded-full border border-border shadow-xl w-[320px]">
                    <div className="flex-1 overflow-hidden h-full flex items-center justify-center relative">
                        {visualizerStream && isRecording && !isProcessing && (
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

                        {isProcessing && (
                            <div className="absolute inset-x-0 inset-y-0 bg-white/80 flex items-center justify-center rounded-full z-10 gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="text-xs font-medium">
                                    {loadingMessage}
                                </span>
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
                                    disabled={isProcessing}
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
                                        disabled={transcriptionMode === "web-speech"}
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
                                                    onKeyDownCapture={(e) => e.stopPropagation()} // Prevents Radix from closing the menu on spacebar
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

                                {transcriptionMode === "web-speech" && (
                                    <div className="px-2 pb-1 text-[11px] text-muted-foreground/80 leading-tight">
                                        Web Speech is restricted to English. Select a Whisper model for multilingual.
                                    </div>
                                )}

                                <DropdownMenuSeparator className="my-2" />

                                {/* Model Selection */}
                                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                    Model
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        stopAllStreams();
                                        if (transcriptionMode === "web-speech") resetWebSpeech();
                                        setLanguage("en");
                                        setTranscriptionMode("web-speech");
                                        startRecordingFn("web-speech", "en");
                                    }}
                                    className="flex items-center justify-between py-3 cursor-pointer focus:bg-gray-50 focus:text-primary"
                                >
                                    <div className="flex flex-col text-left">
                                        <span className="font-semibold text-sm">Web Speech API</span>
                                        <span className="text-xs text-muted-foreground mt-0.5">Instant (English Only)</span>
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
                                            <span className="text-xs text-muted-foreground">More accurate (multilingual)</span>
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
                            disabled={isProcessing}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-green-50 hover:text-green-600"
                            onClick={handleConfirm}
                            disabled={isProcessing || (transcriptionMode !== "web-speech" && !isRecording)}
                        >
                            {isProcessing ? (
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