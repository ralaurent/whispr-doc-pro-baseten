// __tests__/lib/dynamodb-client.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { putItem, getItem, updateItem } from '@/lib/dynamodb/client';
import { TABLE_NAMES, generatePk, generateDocumentSk } from '@/lib/dynamodb/schema';
import { mockDynamoDB } from '../setup';

describe('DynamoDB Client Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call putItem and save a document', async () => {
    const pk = generatePk('user-123');
    const sk = generateDocumentSk('doc-456');
    const doc = { pk, sk, documentName: 'Test' };

    await putItem(TABLE_NAMES.DOCUMENTS, doc);

    // Assert that .send() was called on the mock client
    expect(mockDynamoDB.send).toHaveBeenCalledTimes(1);
    const command = mockDynamoDB.send.mock.calls[0][0];
    expect(command.constructor.name).toBe('PutItemCommand');
    expect(command.input.TableName).toBe(TABLE_NAMES.DOCUMENTS);
    expect(command.input.Item).toMatchObject({ pk, sk });
  });

  it('should call getItem and retrieve a document', async () => {
    const pk = generatePk('user-123');
    const sk = generateDocumentSk('doc-789');
    const mockResponse = {
      Item: {
        pk,
        sk,
        documentName: 'Retrieved',
      },
    };
    mockDynamoDB.send.mockResolvedValueOnce(mockResponse);

    const result = await getItem(TABLE_NAMES.DOCUMENTS, { pk, sk });

    expect(result).toMatchObject({ pk, sk, documentName: 'Retrieved' });
    expect(mockDynamoDB.send).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        TableName: TABLE_NAMES.DOCUMENTS,
        Key: { pk, sk },
      }),
    }));
  });

  it('should handle errors gracefully', async () => {
    mockDynamoDB.send.mockRejectedValueOnce(new Error('Network failure'));
    await expect(putItem(TABLE_NAMES.DOCUMENTS, { pk: 'x', sk: 'y' }))
      .rejects.toThrow('Network failure');
  });
});