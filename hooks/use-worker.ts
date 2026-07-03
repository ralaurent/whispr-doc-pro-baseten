// hooks/use-worker.ts
import { useEffect, useRef } from 'react'

export interface MessageEventHandler {
    (event: MessageEvent): void
}

export function useWorker(messageEventHandler: MessageEventHandler): Worker | null {
    const workerRef = useRef<Worker | null>(null)
    const handlerRef = useRef(messageEventHandler)

    useEffect(() => {
        handlerRef.current = messageEventHandler
    })

    useEffect(() => {
        if (typeof window === 'undefined') return

        const worker = new Worker(new URL('../lib/worker.js', import.meta.url), {
            type: 'module',
        })

        const stableHandler = (event: MessageEvent) => handlerRef.current(event)
        worker.addEventListener('message', stableHandler)
        workerRef.current = worker

        return () => {
            worker.removeEventListener('message', stableHandler)
            worker.terminate()
            workerRef.current = null
        }
    }, [])

    return workerRef.current
}