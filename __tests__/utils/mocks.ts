// __tests__/utils/mocks.ts
import { vi } from 'vitest';
import { NextRequest } from 'next/server';

// Constructs a REAL NextRequest object that satisfies the type system
export function createMockRequest(
    endpoint: string,
    method: string = 'POST',
    body?: any,
    headers: Record<string, string> = {}
): NextRequest {
    const url = `http://localhost:3000${endpoint}`;

    if (body instanceof FormData) {
        return new NextRequest(url, {
            method,
            body,
            headers,
        });
    }

    return new NextRequest(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
}

// Mock helpers for Baseten
export const mockBasetenSuccess = (extractedData: any) => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: extractedData }),
    } as any);
};

export const mockBasetenError = (status: number = 500) => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status,
        statusText: 'Internal Server Error',
    } as any);
};