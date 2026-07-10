// __tests__/setup.ts
import { vi } from 'vitest';

// ====== 1. Prevent "server-only" client component error ======
vi.mock('server-only', () => ({}));

// ====== 2. Mock Langfuse to silence warnings ======
vi.mock('langfuse', () => ({
    Langfuse: vi.fn().mockImplementation(function() {
        return {
            trace: vi.fn().mockReturnValue({
                id: 'mock-trace-id',
                span: vi.fn().mockReturnValue({ end: vi.fn() }),
                generation: vi.fn().mockReturnValue({ end: vi.fn() }),
                update: vi.fn(),
            }),
            event: vi.fn(),
            flushAsync: vi.fn().mockResolvedValue(undefined),
        };
    }),
}));

// ====== 3. Mock PDF parsing – so your route doesn't try to parse a fake PDF ======
vi.mock('pdf-parse', () => ({
    default: vi.fn().mockResolvedValue({ text: 'Dummy invoice text' }),
}));

vi.mock('@/lib/extract-html', () => ({
    extractHTML: vi.fn().mockResolvedValue('<html><body>Mock PDF content</body></html>'),
    extractPageText: vi.fn().mockResolvedValue([]),
    buildHtmlPages: vi.fn().mockReturnValue([{ html: '<div data-field-id="1"></div>', pageIndex: 0 }]),
}));

// ====== 4. Mock DynamoDB with a proper constructor ======
// Create a shared send spy so tests can assert on it
const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend };

// IMPORTANT: use a regular function (not arrow) so it can be called with `new`
const DynamoDBClientMock = vi.fn().mockImplementation(function () {
    return mockClient;
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: DynamoDBClientMock,
    GetItemCommand: class GetItemCommand { input: any; constructor(input: any) { this.input = input; } },
    PutItemCommand: class PutItemCommand { input: any; constructor(input: any) { this.input = input; } },
    UpdateItemCommand: class UpdateItemCommand { input: any; constructor(input: any) { this.input = input; } },
    DeleteItemCommand: class DeleteItemCommand { input: any; constructor(input: any) { this.input = input; } },
    QueryCommand: class QueryCommand { input: any; constructor(input: any) { this.input = input; } },
}));

vi.mock('@aws-sdk/util-dynamodb', () => ({
    marshall: vi.fn((obj) => obj),
    unmarshall: vi.fn((obj) => obj),
}));

// ====== 5. Mock Supabase server client ======
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn().mockImplementation(() => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: { id: 'test-user-123' } },
                error: null,
            }),
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'doc-123' }, error: null }),
    })),
}));

// ====== 6. Mock global fetch (Baseten calls) ======
global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data: { extracted_fields: { name: 'John' } } }),
    text: vi.fn().mockResolvedValue(''),
    body: null,
} as any);

// Export the spy so tests can assert on DynamoDB calls
export const mockDynamoDB = { send: mockSend };