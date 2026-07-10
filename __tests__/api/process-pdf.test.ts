// __tests__/api/process-pdf.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/process-pdf/route';
import { createMockRequest } from '../utils/mocks';

// Mock pdf-lib to return a fake PDF document with one field
vi.mock('pdf-lib', async (importOriginal) => {
    const actual = await importOriginal<typeof import('pdf-lib')>();
    return {
        ...actual,
        PDFDocument: {
            ...actual.PDFDocument,
            load: vi.fn().mockResolvedValue({
                getPages: () => [
                    { 
                        ref: { toString: () => 'ref1' }, 
                        getSize: () => ({ width: 612, height: 792 }), 
                        getRotation: () => ({ angle: 0 }) 
                    }
                ],
                getForm: () => ({
                    getFields: () => [
                        {
                            getName: () => 'field1',
                            acroField: { 
                                dict: { 
                                    get: (key: any) => {
                                        const name = key?.encodedName || String(key);
                                        if (name.includes('Rect')) return { asArray: () => [0, 0, 100, 20] };
                                        if (name.includes('P')) return { toString: () => 'ref1' };
                                        if (name.includes('Kids')) return undefined;
                                        return undefined;
                                    } 
                                } 
                            },
                        }
                    ]
                }),
                catalog: { get: () => undefined },
                context: { lookup: () => undefined },
                save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
            }),
        },
    };
});

describe('POST /api/process-pdf - Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully process a PDF and return detected fields', async () => {
        const formData = new FormData();
        const fakeFile = new File(['dummy pdf content'], 'test.pdf', { type: 'application/pdf' });
        formData.append('file', fakeFile);

        // Mock fetch to simulate OpenRouter/Baseten success
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"1": "invoice_number"}' } }] }),
        } as any);

        const req = createMockRequest('/api/process-pdf', 'POST', formData);

        const response = await POST(req);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toHaveProperty('detectedFields');
        expect(json.detectedFields.length).toBeGreaterThan(0);
        expect(json.detectedFields[0].name).toBe('invoice_number');
    });

    it('should return 400 if no PDF file is uploaded', async () => {
        const emptyFormData = new FormData();
        const req = createMockRequest('/api/process-pdf', 'POST', emptyFormData);

        const response = await POST(req);
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain('No file uploaded');
    });

    it('should gracefully handle API failure and fallback to original names', async () => {
        const formData = new FormData();
        formData.append('file', new File(['dummy'], 'test.pdf', { type: 'application/pdf' }));
        const req = createMockRequest('/api/process-pdf', 'POST', formData);

        // Simulate API failure
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 503,
            text: vi.fn().mockResolvedValue('Service Unavailable'),
            json: vi.fn().mockResolvedValue({ error: 'Service Unavailable' })
        } as any);

        const response = await POST(req);
        const json = await response.json();

        // Should return 200 with fallback field names (not 500/503)
        expect(response.status).toBe(200);
        expect(json.detectedFields[0].name).toBe('field1');
    });
});