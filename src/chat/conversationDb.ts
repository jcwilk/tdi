import Dexie from 'dexie';

export interface MessageDB {
  content: string;
  participantId: string;
  role: string;
  hash: string;
  timestamp: number;
  parentHash: string | null;
}

export class ConversationDB extends Dexie {
  messages: Dexie.Table<MessageDB, string>;

  constructor() {
    super('ConversationDatabase');

    // Version 1 remains unchanged for legacy support
    this.version(1).stores({
      messages: '&hash,timestamp',
      edges: '&compositeHash,childHash,parentHash'
    });

    // Version 2 of the DB with the updated schema
    this.version(2).stores({
      messages: '&hash,timestamp,parentHash'
    }).upgrade(async (trans) => {
      const edges = trans.table('edges');
      const messages = trans.table<MessageDB, string>('messages');

      // Create a map of childHash to parentHash for faster lookup
      const parentHashMap: { [childHash: string]: string } = {};
      const allEdges = await edges.toArray();
      allEdges.forEach(edge => {
        parentHashMap[edge.childHash] = edge.parentHash;
      });

      // Update messages using the map
      const allMessages = await messages.toArray();
      for (const msg of allMessages) {
        const parentHash = parentHashMap[msg.hash] || null;
        await messages.update(msg.hash, { parentHash });
      }

      // No need to clear edges, it will be automatically dropped
    });

    // Define tables
    this.messages = this.table('messages');
  }

  async saveMessage(message: MessageDB, parentHash: string | null): Promise<MessageDB> {
    return this.transaction('rw', this.messages, async () => {
      const existingMessage = await this.getMessageByHash(message.hash);

      // Check if the hash exists but with a different parent hash
      if (existingMessage && existingMessage.parentHash !== parentHash) {
        throw new Error(`Message with hash: ${message.hash} exists but with a different parent hash.`);
      }

      // Return the existing message if it matches the hash and parent hash
      if (existingMessage) {
        return existingMessage;
      }

      // Constraint to ensure that the parentHash exists in the DB (if not a root message)
      if (parentHash !== null && !(await this.getMessageByHash(parentHash))) {
        throw new Error(`Parent hash: ${parentHash} does not exist in the database.`);
      }

      message.parentHash = parentHash;
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
    // Get all parentHash values
    const parentHashes: string[] = await this.messages
      .toArray()
      .then(messages => messages
        .filter(message => message.parentHash !== null) // Exclude root messages
        .map(message => message.parentHash as string)); // Convert parentHash to string (since it's not null)

    // Retrieve messages where their hash is not in the list of parent hashes
    return this.messages.where('hash').noneOf(parentHashes).toArray();
  }

}
