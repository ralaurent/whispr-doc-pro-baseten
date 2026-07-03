import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  type GetItemCommandInput,
  type PutItemCommandInput,
  type QueryCommandInput,
  type UpdateItemCommandInput,
  type DeleteItemCommandInput,
} from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"

// Initialize DynamoDB client with region from environment
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
})

export { dynamoDBClient, marshall, unmarshall }

// Helper types for type-safe DynamoDB operations
export interface DynamoDBItem {
  [key: string]: any
}

// Generic get item helper
export async function getItem(
  tableName: string,
  key: Record<string, any>,
): Promise<DynamoDBItem | null> {
  try {
    const input: GetItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
    }
    const command = new GetItemCommand(input)
    const response = await dynamoDBClient.send(command)
    return response.Item ? unmarshall(response.Item) : null
  } catch (error) {
    console.error(`DynamoDB getItem failed for ${tableName}:`, error)
    throw error
  }
}

// Generic put item helper
export async function putItem(
  tableName: string,
  item: DynamoDBItem,
): Promise<void> {
  try {
    const input: PutItemCommandInput = {
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    }
    const command = new PutItemCommand(input)
    await dynamoDBClient.send(command)
  } catch (error) {
    console.error(`DynamoDB putItem failed for ${tableName}:`, error)
    throw error
  }
}

// Generic query helper
export async function queryItems(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, any>,
  expressionAttributeNames?: Record<string, string>,
  limit?: number,
): Promise<DynamoDBItem[]> {
  try {
    const input: QueryCommandInput = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      Limit: limit,
    }
    if (expressionAttributeNames) {
      input.ExpressionAttributeNames = expressionAttributeNames
    }
    const command = new QueryCommand(input)
    const response = await dynamoDBClient.send(command)
    return (response.Items || []).map((item) => unmarshall(item))
  } catch (error) {
    console.error(`DynamoDB queryItems failed for ${tableName}:`, error)
    throw error
  }
}

// Generic update item helper
export async function updateItem(
  tableName: string,
  key: Record<string, any>,
  updateExpression: string,
  expressionAttributeValues: Record<string, any>,
  expressionAttributeNames?: Record<string, string>,
): Promise<DynamoDBItem | null> {
  try {
    const input: UpdateItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: "ALL_NEW",
    }
    if (expressionAttributeNames) {
      input.ExpressionAttributeNames = expressionAttributeNames
    }
    const command = new UpdateItemCommand(input)
    const response = await dynamoDBClient.send(command)
    return response.Attributes ? unmarshall(response.Attributes) : null
  } catch (error) {
    console.error(`DynamoDB updateItem failed for ${tableName}:`, error)
    throw error
  }
}

// Generic delete item helper
export async function deleteItem(
  tableName: string,
  key: Record<string, any>,
): Promise<void> {
  try {
    const input: DeleteItemCommandInput = {
      TableName: tableName,
      Key: marshall(key),
    }
    const command = new DeleteItemCommand(input)
    await dynamoDBClient.send(command)
  } catch (error) {
    console.error(`DynamoDB deleteItem failed for ${tableName}:`, error)
    throw error
  }
}
