"use client"

import { useEffect, useRef } from "react"

interface AudioVisualizerProps {
    stream: MediaStream | null;
    width?: number;
    height?: number;
    barColor?: string;
    gap?: number;
    barWidth?: number;
}

export function AudioVisualizer({
    stream,
    width = 220,
    height = 30,
    barColor = "#000000",
    gap = 2,
    barWidth = 2
}: AudioVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number>(null)
    const historyRef = useRef<number[]>([])

    useEffect(() => {
        if (!stream || !canvasRef.current) return

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        source.connect(analyser)

        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const totalBarWidth = barWidth + gap
        const maxBars = Math.ceil(width / totalBarWidth)

        if (historyRef.current.length === 0) {
            historyRef.current = new Array(maxBars).fill(0)
        }

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw)

            analyser.getByteTimeDomainData(dataArray)

            // Calculate the Root Mean Square (RMS) amplitude for this specific frame
            // This gives us the "loudness" of the audio at this exact moment
            let sum = 0
            for (let i = 0; i < bufferLength; i++) {
                // dataArray values range 0-255, with 128 being silence (center)
                const x = dataArray[i] - 128
                sum += x * x
            }
            const rms = Math.sqrt(sum / bufferLength)

            // Normalize volume (RMS usually peaks around 128 in extreme cases, but usually lower)
            // We scale it up a bit (x2) to make the visualizer more sensitive
            const normalizedVolume = Math.min(1, (rms / 128) * 2)

            // Update history: Remove oldest (left) and add newest (right)
            if (historyRef.current.length >= maxBars) {
                historyRef.current.pop()
            }
            historyRef.current.unshift(normalizedVolume)


            // Clear and Render
            ctx.clearRect(0, 0, width, height)

            historyRef.current.forEach((val, index) => {
                // Calculate height based on volume
                // Ensure a tiny minimum height (e.g., 2px) so the line is visible even in silence
                const barHeight = Math.max(2, val * height)

                const x = index * totalBarWidth
                const y = (height - barHeight) / 2

                ctx.fillStyle = barColor

                // Optional: Round corners for a cleaner look
                ctx.beginPath()
                ctx.roundRect(x, y, barWidth, barHeight, 2)
                ctx.fill()
            })
        }

        draw()

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            // Clean up history to reset animation on unmount or stream change
            historyRef.current = []
            audioContext.close()
        }
    }, [stream, width, height, barColor, gap, barWidth])

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="block"
        />
    )
}