// hooks/use-worker.ts
import { useEffect, useRef, useState } from 'react'

export interface MessageEventHandler {
    (event: MessageEvent): void
}

let globalWorker: Worker | null = null;
const subscribers = new Set<MessageEventHandler>();

const getWorkerInstance = () => {
    if (typeof window === 'undefined') return null;
    if (!globalWorker) {
        globalWorker = new Worker(new URL('../lib/worker.js', import.meta.url), {
            type: 'module',
        });
        globalWorker.addEventListener('message', (event: MessageEvent) => {
            subscribers.forEach(handler => handler(event));
        });
    }
    return globalWorker;
};

export function useWorker(messageEventHandler: MessageEventHandler): Worker | null {
    const [worker, setWorker] = useState<Worker | null>(null);
    const handlerRef = useRef(messageEventHandler);

    useEffect(() => {
        handlerRef.current = messageEventHandler;
    });

    useEffect(() => {
        const w = getWorkerInstance();
        setWorker(w);

        const stableHandler = (event: MessageEvent) => handlerRef.current(event);
        subscribers.add(stableHandler);

        return () => {
            subscribers.delete(stableHandler);
        };
    }, []);

    return worker;
}