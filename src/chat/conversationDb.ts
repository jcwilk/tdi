import Dexie from 'dexie';

export interface MessageDB {
  content: string;
  participantId: string;
  role: string;
  hash: string;
  timestamp: number;
}

export interface EdgeDB {
  childHash: string;
  parentHash: string;
}

// Simplified IndexedDB wrapper for conversation use-case
export class ConversationDB extends Dexie {
  messages: Dexie.Table<MessageDB, string>;
  edges: Dexie.Table<EdgeDB, string>;

  constructor() {
    super('ConversationDatabase');

    this.version(1).stores({
      messages: '&hash,timestamp',
      edges: '&compositeHash,childHash,parentHash'
    });

    // Define tables
    this.messages = this.table('messages');
    this.edges = this.table('edges');
  }

  async saveMessage(message: MessageDB, parentHashes: string[]): Promise<MessageDB> {
    const existingMessage = await this.getMessageByHash(message.hash);
    if (existingMessage) {
      return existingMessage;
    }

    const edges = parentHashes.map(parentHash => ({
      childHash: message.hash,
      parentHash: parentHash,
      compositeHash: `${message.hash}_${parentHash}`
    }));

    return this.transaction('rw', this.messages, this.edges, async () => {
      await this.messages.add(message);
      await this.edges.bulkAdd(edges);
      return message;
    });
  }

  getMessageByHash(hash: string): Promise<MessageDB | undefined> {
    return this.messages.get(hash);
  }

  async getConversationFromLeaf(leafHash: string): Promise<MessageDB[]> {
    const conversation: MessageDB[] = [];
    let currentHash: string | undefined = leafHash;

    while (currentHash) {
      const message = await this.getMessageByHash(currentHash);
      if (!message) break;

      conversation.push(message);
      const parentEdge: EdgeDB | undefined = await this.edges.where('childHash').equals(currentHash).first();
      currentHash = parentEdge?.parentHash;
    }

    return conversation.reverse();
  }

  async getLeafMessages(): Promise<MessageDB[]> {
    const parentHashes = await this.edges.toArray().then(edges => edges.map(edge => edge.parentHash));
    return this.messages.where('hash').noneOf(parentHashes).toArray();
  }
}
