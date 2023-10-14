// TODO: rename file (?) and type from MessageDB to PersistedMessage (?)

import Dexie from 'dexie';
import { ParticipantRole } from './participantSubjects';
import { Message } from './conversation';
import { Observable } from 'rxjs';

// A special type for when it's between messagePersistence and being saved
export type MessageSpec = Message & {
  content: string;
  role: ParticipantRole;
  hash: string;
  parentHash: string | null;
}

export type MessageDB = MessageSpec & {
  content: string;
  role: ParticipantRole;
  hash: string;
  parentHash: string | null;
  timestamp: number;
}

export type MaybePersistedMessage = Message | MessageDB;

export type ConversationMessages = [MessageDB, ...MessageDB[]];

export interface EmbeddingSpec {
  hash: string;
  embedding: number[];
  type: MetadataType & 'messageEmbedding';
}

export type EmbeddingDB = EmbeddingSpec & {
  hash: string;
  embedding: number[];
  type: MetadataType & 'messageEmbedding';
  timestamp: number;
}

export type MetadataType = 'messageEmbedding';

export function isMessageDB(message: MaybePersistedMessage | MessageSpec): message is MessageDB {
  return (message as MessageDB).timestamp !== undefined;
}


export type MetadataHandlers<T extends string> = {
  [K in T]?: () => Promise<EmbeddingSpec>; // TODO: this will need to cover summaries eventually too
};

export class ConversationDB extends Dexie {
  messages: Dexie.Table<MessageDB, string>;
  embeddings: Dexie.Table<EmbeddingDB, string>;

  constructor() {
    super('ConversationDatabase');

    this.version(9).stores({
      messages: '&hash,timestamp,parentHash,role,content',
      embeddings: '&hash,timestamp,type,embedding'
    });

    // Define tables
    this.messages = this.table('messages');
    this.embeddings = this.table('embeddings');
  }

  async saveMessage<T extends MetadataType>(message: MessageDB | MessageSpec, metadataHandlers: MetadataHandlers<T>): Promise<[MessageDB, Record<T, EmbeddingSpec>]> {
    console.log("saving messagedb!")
    console.log("Available tables: ", this.tables.map(table => table.name));
    let persistedMessage: MessageDB;
    if (isMessageDB(message)) {
      persistedMessage = message;
    }
    else {
      const messageSpec = message;
      persistedMessage = await this.transaction('rw', this.messages, async (): Promise<MessageDB> => {
        const existingMessage = await this.getMessageByHash(messageSpec.hash);

        // Check if the hash exists but with a different parent hash
        if (existingMessage && (existingMessage.parentHash || messageSpec.parentHash) && existingMessage.parentHash !== messageSpec.parentHash) {
          throw new Error(`Message with hash: ${messageSpec.hash} exists but with a different parent hash.`);
        }

        // Return the existing message if it matches the hash and parent hash
        if (existingMessage) {
          return existingMessage;
        }

        // Constraint to ensure that the parentHash exists in the DB (if not a root message)
        if (messageSpec.parentHash && !(await this.getMessageByHash(messageSpec.parentHash))) {
          throw new Error(`Parent hash: ${messageSpec.parentHash} does not exist in the database.`);
        }

        const newMessage: MessageDB = { ...messageSpec, timestamp: Date.now() };
        await this.messages.add(newMessage);
        return newMessage;
      });
    }

    const metadataRecords: Record<T, EmbeddingSpec> = {} as Record<T, EmbeddingSpec>;

    for (const metadataType in metadataHandlers) {
      const handler = metadataHandlers[metadataType];
      if (!handler) continue;

      // Check if a matching embedding already exists in the database
      const existingEmbedding = await this.getEmbeddingByHash(message.hash);
      if (existingEmbedding) {
        metadataRecords[metadataType] = {
          hash: existingEmbedding.hash,
          embedding: existingEmbedding.embedding,
          type: existingEmbedding.type
        };
        continue;  // Skip the rest and move to the next metadataType
      }

      const metadataSpec = await handler();
      metadataRecords[metadataType] = metadataSpec;
      // Save the metadata spec to the database
      // You'll need to implement this based on how you want to store the metadata specs
      await this.saveMetadata(metadataSpec);
    }

    return [persistedMessage, metadataRecords];
  }

  async saveMetadata(spec: EmbeddingSpec): Promise<EmbeddingDB> {
    console.log("Saving metadata!")
    console.log("Available tables: ", this.tables.map(table => table.name));
    return this.transaction('rw', [this.messages, this.embeddings], async () => {
      const existingEmbedding = await this.getEmbeddingByHash(spec.hash);

      // Check if the embedding exists
      if (existingEmbedding) {
        return existingEmbedding;
      }

      // Constraint to ensure that the hash exists in the DB
      if (!(await this.getMessageByHash(spec.hash))) {
        throw new Error(`Hash: ${spec.hash} does not exist in the database.`);
      }

      const embeddingDB: EmbeddingDB = { ...spec, timestamp: Date.now() };
      console.log("saving embedding!", embeddingDB)
      await this.embeddings.add(embeddingDB);
      return embeddingDB;
    });
  }

  getMessageByHash(hash: string): Promise<MessageDB | undefined> {
    return this.messages.get(hash);
  }

  getEmbeddingByHash(hash: string): Promise<EmbeddingDB | undefined> {
    return this.embeddings.get(hash);
  }

  async getConversationFromLeaf(leafHash: string): Promise<MessageDB[]> {
    const conversation: MessageDB[] = [];
    let currentHash: string | null = leafHash;

    while (currentHash) {
      const message = await this.getMessageByHash(currentHash);
      if (!message) break;

      conversation.push(message);
      currentHash = message.parentHash;
    }

    return conversation.reverse();
  }

  async getConversationFromLeafMessage(leafMessage: MessageDB): Promise<ConversationMessages> {
    const conversation: ConversationMessages = [leafMessage];
    if (!leafMessage.parentHash) return conversation;

    const parentMessage = await this.getMessageByHash(leafMessage.parentHash);
    if (!parentMessage) return conversation;

    return [...await this.getConversationFromLeafMessage(parentMessage), ...conversation];
  }

  getLeafMessages(): Observable<MessageDB> {
    return new Observable(subscriber => {

      const dfs = async (message: MessageDB) => {
        // Find child messages of the current message
        const children = await this.messages.where('parentHash').equals(message.hash).reverse().sortBy('timestamp');

        if (children.length === 0) {
          // If the current message has no children, broadcast it
          subscriber.next(message);
        } else {
          // Otherwise, continue the DFS with the child messages
          for (const child of children) {
            await dfs(child);
          }
        }
      };

      // Start the DFS from the root messages
      this.messages.filter(message => message.parentHash == null).reverse().sortBy('timestamp').then(async rootMessages => {
        for (const root of rootMessages) {
          await dfs(root);
        }
        subscriber.complete();
      }).catch(err => {
        subscriber.error(err);
      });
    });
  }

  async searchEmbedding(embedding: number[], limit: number): Promise<string[]> {
    const embeddingsArray = await this.embeddings.toArray();
    const batchDurationMs = 50; // Adjust this value to control the max duration for each batch
    let closestEmbeddings: { hash: string, distance: number }[] = [];

    return new Promise<string[]>((resolve) => {
      const processBatch = (startIndex: number) => {
        const startTime = Date.now();

        while (startIndex < embeddingsArray.length && Date.now() - startTime < batchDurationMs) {
          closestEmbeddings.push({
            hash: embeddingsArray[startIndex].hash,
            distance: this.cosineSimilarity(embedding, embeddingsArray[startIndex].embedding),
          });
          startIndex++;
        }

        if (startIndex < embeddingsArray.length) {
          setTimeout(() => processBatch(startIndex), 0);
        } else {
          closestEmbeddings = closestEmbeddings.sort((a, b) => b.distance - a.distance);
          const result = closestEmbeddings.slice(0, limit).map(embedding => embedding.hash);
          resolve(result);
        }
      };

      processBatch(0); // Start the batch processing
    });
  }

  private cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings have different dimensions');
    }

    const embedding1Norm = Math.sqrt(embedding1.reduce((sum, value) => sum + value ** 2, 0));
    const embedding2Norm = Math.sqrt(embedding2.reduce((sum, value) => sum + value ** 2, 0));

    const dotProduct = embedding1.reduce((sum, value, index) => sum + value * embedding2[index], 0);

    return dotProduct / (embedding1Norm * embedding2Norm);
  }

  async getLeafMessageFromAncestor(message: MessageDB): Promise<MessageDB> {
    const children = await this.messages.where('parentHash').equals(message.hash).sortBy('timestamp');
    if (children.length === 0) {
        return message;  // No children, message is a leaf node
    }
    // Recurse with the oldest child
    return this.getLeafMessageFromAncestor(children[0]);
  }
}
