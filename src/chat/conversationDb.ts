import Dexie from 'dexie';
import { ParticipantRole } from './participantSubjects';
import { Message } from './conversation';

export interface MessageDB {
  content: string;
  role: ParticipantRole;
  hash: string;
  timestamp: number;
  parentHash: string | null;
  embedding: number[];
}

export function isMessageDB(message: Message | MessageDB): message is MessageDB {
  return (message as MessageDB).hash !== undefined;
}

export class ConversationDB extends Dexie {
  messages: Dexie.Table<MessageDB, string>;

  constructor() {
    super('ConversationDatabase');

    this.version(4).stores({
      messages: '&hash,timestamp,parentHash,embedding'
    }).upgrade(trans => {
      return trans.table('messages').clear();  // Clear out all old messages
    });

    this.version(5).stores({
      messages: '&hash,timestamp,parentHash,embedding,role,content', // participantId removed from schema
    }).upgrade(trans => {
      return trans.table('messages').toCollection().modify(msg => {
        delete msg.participantId; // remove participantId from each record
      });
    });

    // Define tables
    this.messages = this.table('messages');
  }

  async saveMessage(message: MessageDB): Promise<MessageDB> {
    return this.transaction('rw', this.messages, async () => {
      const existingMessage = await this.getMessageByHash(message.hash);

      // Check if the hash exists but with a different parent hash
      if (existingMessage && (existingMessage.parentHash || message.parentHash) && existingMessage.parentHash !== message.parentHash) {
        throw new Error(`Message with hash: ${message.hash} exists but with a different parent hash.`);
      }

      // Return the existing message if it matches the hash and parent hash
      if (existingMessage) {
        return existingMessage;
      }

      // Constraint to ensure that the parentHash exists in the DB (if not a root message)
      if (message.parentHash && !(await this.getMessageByHash(message.parentHash))) {
        throw new Error(`Parent hash: ${message.parentHash} does not exist in the database.`);
      }

      await this.messages.add(message);
      return message;
    });
  }

  getMessageByHash(hash: string): Promise<MessageDB | undefined> {
    return this.messages.get(hash);
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

  async getLeafMessages(): Promise<MessageDB[]> {
    const messagesArray = await this.messages.toArray();

    // Get all unique parentHash values (excluding null and undefined)
    const parentHashes = [...new Set(
      messagesArray
        .map(message => message.parentHash)
        .filter(hash => hash !== null && typeof hash === 'string') as string[]
    )];

    // Retrieve messages where their hash is not in the list of parent hashes
    return this.messages.where('hash').noneOf(parentHashes).toArray();
  }

  async searchEmbedding(embedding: number[], limit: number): Promise<string[]> {
    const messagesArray = await this.messages.toArray();
    const batchDurationMs = 50; // Adjust this value to control the max duration for each batch
    let closestMessages: { hash: string, distance: number }[] = [];

    return new Promise<string[]>((resolve) => {
      const processBatch = (startIndex: number) => {
        const startTime = Date.now();

        while (startIndex < messagesArray.length && Date.now() - startTime < batchDurationMs) {
          closestMessages.push({
            hash: messagesArray[startIndex].hash,
            distance: this.cosineSimilarity(embedding, messagesArray[startIndex].embedding),
          });
          startIndex++;
        }

        if (startIndex < messagesArray.length) {
          setTimeout(() => processBatch(startIndex), 0);
        } else {
          closestMessages = closestMessages.sort((a, b) => b.distance - a.distance);
          const result = closestMessages.slice(0, limit).map(message => message.hash);
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
}
