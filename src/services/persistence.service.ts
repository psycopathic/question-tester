import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getUserId, type PersistenceAdapter } from 'ask-sdk-core';
import type { RequestEnvelope } from 'ask-sdk-model';

/**
 * Stores test progress per Alexa user, so it survives the end of an Alexa session.
 * Written against AWS SDK v3 because Amazon's adapter still depends on the end-of-support v2 SDK.
 */
export class DynamoDbSessionAdapter implements PersistenceAdapter {
  private readonly client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  constructor(private readonly tableName: string) {}

  async getAttributes(envelope: RequestEnvelope): Promise<Record<string, unknown>> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { id: getUserId(envelope) } }));
    return (Item?.attributes as Record<string, unknown>) ?? {};
  }

  async saveAttributes(envelope: RequestEnvelope, attributes: Record<string, unknown>): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: { id: getUserId(envelope), attributes } }));
  }

  async deleteAttributes(envelope: RequestEnvelope): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { id: getUserId(envelope) } }));
  }
}
