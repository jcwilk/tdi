import Dexie from 'dexie';
import { Message } from './conversation';
import { Observable, defer, filter, merge, mergeMap, of } from 'rxjs';

// A special type for when it's between messagePersistence and being saved
export type MessageSpec = Message & {
  hash: string;
  parentHash: string;
}

export type MessageDB = MessageSpec & {
  timestamp: number;
}

export type MaybePersistedMessage = Message | MessageDB;

export type ConversationMessages = [MessageDB, ...MessageDB[]];

export interface EmbeddingSpec {
  hash: string;
  embedding: number[];
}

export type EmbeddingDB = EmbeddingSpec & {
  hash: string;
  embedding: number[];
  timestamp: number;
}

export type PinDB = {
  hash: string;
  timestamp: number;
  version: number;
  remoteTimestamp: number;
};

export const rootMessageHash = 'root';

export function isMessageDB(message: MaybePersistedMessage | MessageSpec): message is MessageDB {
  return (message as MessageDB).timestamp !== undefined;
}

// require messageSummary to be defined when summaryEmbedding is defined
export type MetadataHandlers = {
  'messageEmbedding'?: () => Promise<EmbeddingSpec>;
  'messageSummary'?: () => Promise<MessageSummarySpec>;
  'summaryEmbedding'?: (summary: MessageSummaryDB) => Promise<SummaryEmbeddingSpec>;
}

export type LeafPath = {
  message: MessageDB,
  pathLength: number
};

export type MessageSummarySpec = {
  hash: string;
  summary: string;
}

export type MessageSummaryDB = MessageSummarySpec & {
  hash: string;
  summary: string;
  timestamp: number;
}

export interface SummaryEmbeddingSpec {
  hash: string;
  embedding: number[];
}

export type SummaryEmbeddingDB = SummaryEmbeddingSpec & {
  hash: string;
  embedding: number[];
  timestamp: number;
}

const METADATA_TYPES = ['messageEmbedding', 'messageSummary', 'summaryEmbedding'] as const;
export type MetadataType = typeof METADATA_TYPES[number];

function hasParent(message: MessageSpec) {
  return message.parentHash && message.parentHash !== rootMessageHash;
}

export type MetadataRecords = {
  'messageEmbedding'?: EmbeddingDB;
  'messageSummary'?: MessageSummaryDB;
  'summaryEmbedding'?: SummaryEmbeddingDB;
};

function assertKeysMatch<T extends MetadataType>(handlers: MetadataHandlers, records: MetadataRecords): asserts records is Record<T, EmbeddingSpec | MessageSummarySpec | SummaryEmbeddingSpec> {
  for (const key in handlers) {
    if (!(key in records)) {
      throw new Error(`Key ${key} is missing in metadata records.`);
    }
  }
}

export class ConversationDB extends Dexie {
  messages: Dexie.Table<MessageDB, string>;
  embeddings: Dexie.Table<EmbeddingDB, string>;
  summaries: Dexie.Table<MessageSummaryDB, string>;
  summaryEmbeddings: Dexie.Table<SummaryEmbeddingDB, string>;
  pins: Dexie.Table<PinDB, string>;

  constructor() {
    super('ConversationDatabase');

    this.version(13).stores({
      messages: '&hash,timestamp,parentHash,role,content',
      embeddings: '&hash,timestamp,embedding',
      summaries: '&hash,timestamp,summary',
      summaryEmbeddings: '&hash,timestamp,embedding',
      pins: '&hash,timestamp,version,remoteTimestamp'
    });

    this.messages = this.table('messages');
    this.embeddings = this.table('embeddings');
    this.summaries = this.table('summaries');
    this.summaryEmbeddings = this.table('summaryEmbeddings');
    this.pins = this.table('pins');
  }

  // TODO: this method could probably use some love, but keeping it flat and plain until there's a reason to add more types of metadata
  async saveMessage(message: MessageDB | MessageSpec, metadataHandlers: MetadataHandlers): Promise<[MessageDB, MetadataRecords]> {
    console.log("saving messagedb!")
    console.log("Available tables: ", this.tables.map(table => table.name));
    let persistedMessagePromise: Promise<MessageDB>;
    if (isMessageDB(message)) {
      persistedMessagePromise = Promise.resolve(message);
    }
    else {
      const messageSpec = message;
      persistedMessagePromise = this.transaction('rw', this.messages, async (): Promise<MessageDB> => {
        const existingMessage = await this.getMessageByHash(messageSpec.hash);

        // Check if the hash exists but with a different parent hash
        if (existingMessage && (hasParent(existingMessage) || hasParent(messageSpec)) && existingMessage.parentHash !== messageSpec.parentHash) {
          throw new Error(`Message with hash: ${messageSpec.hash} exists but with a different parent hash.`);
        }

        // Return the existing message if it matches the hash and parent hash
        if (existingMessage) {
          return existingMessage;
        }

        // Constraint to ensure that the parentHash exists in the DB (if not a root message)
        if (hasParent(messageSpec) && !(await this.getMessageByHash(messageSpec.parentHash))) {
          throw new Error(`Parent hash: ${messageSpec.parentHash} does not exist in the database.`);
        }

        const newMessage: MessageDB = { ...messageSpec, timestamp: Date.now() };
        await this.messages.add(newMessage);
        return newMessage;
      });
    }

    // Not the most elegant way to do this, but fancier ways to make the typing work would be nearly illegible
    let messageSummaryDBPromise: Promise<MessageSummaryDB> | undefined;
    let summaryEmbeddingDBPromise: Promise<SummaryEmbeddingDB> | undefined;
    let messageEmbeddingDBPromise: Promise<EmbeddingDB> | undefined;

    if (metadataHandlers['messageSummary']) {
      const enclosedHandler = metadataHandlers['messageSummary'];
      messageSummaryDBPromise = this.getSummaryByHash(message.hash).then(summary => {
        if (summary) return summary;

        return enclosedHandler().then(summarySpec => this.saveSummary(summarySpec));
      });
    }

    if (metadataHandlers['summaryEmbedding']) {
      if (!messageSummaryDBPromise) {
        throw new Error('MessageSummary must be specified when SummaryEmbedding is specified.');
      }

      const enclosedMessageSummaryDBPromise = messageSummaryDBPromise;
      const enclosedHandler = metadataHandlers['summaryEmbedding'];
      summaryEmbeddingDBPromise = this.getSummaryEmbeddingByHash(message.hash).then(async embedding => {
        if (embedding) return embedding;

        const summary = await enclosedMessageSummaryDBPromise;
        const embeddingSpec = await enclosedHandler(summary);
        return this.saveSummaryEmbedding(embeddingSpec);
      });
    }

    if (metadataHandlers['messageEmbedding']) {
      const enclosedHandler = metadataHandlers['messageEmbedding'];
      messageEmbeddingDBPromise = this.getEmbeddingByHash(message.hash).then(async embedding => {
        if (embedding) return embedding;

        const embeddingSpec = await enclosedHandler();
        return this.saveMetadata(embeddingSpec);
      });
    }

    const [persistedMessage, messageSummary, summaryEmbedding, messageEmbedding] = await Promise.all(
      [persistedMessagePromise, messageSummaryDBPromise, summaryEmbeddingDBPromise, messageEmbeddingDBPromise]
    );

    const metadataRecords: MetadataRecords = {
      messageEmbedding,
      messageSummary,
      summaryEmbedding,
    };

    assertKeysMatch(metadataHandlers, metadataRecords);
    return [persistedMessage, metadataRecords];
  }

  async getSummaryByHash(hash: string): Promise<MessageSummaryDB | undefined> {
    return this.summaries.get(hash);
  }

  async saveSummary(spec: MessageSummarySpec): Promise<MessageSummaryDB> {
    return this.transaction('rw', [this.messages, this.summaries], async () => {
      const existingSummary = await this.getSummaryByHash(spec.hash);

      if (existingSummary) {
        return existingSummary;
      }

      if (!(await this.getMessageByHash(spec.hash))) {
        throw new Error(`Hash: ${spec.hash} does not exist in the database.`);
      }

      const summaryDB: MessageSummaryDB = { ...spec, timestamp: Date.now() };
      await this.summaries.add(summaryDB);
      return summaryDB;
    });
  }

  async saveSummaryEmbedding(spec: SummaryEmbeddingSpec): Promise<SummaryEmbeddingDB> {
    return this.transaction('rw', [this.messages, this.summaryEmbeddings], async () => {
      const existingSummaryEmbedding = await this.getSummaryEmbeddingByHash(spec.hash);

      if (existingSummaryEmbedding) {
        return existingSummaryEmbedding;
      }

      if (!(await this.getMessageByHash(spec.hash))) {
        throw new Error(`Hash: ${spec.hash} does not exist in the database.`);
      }

      const summaryEmbeddingDB: SummaryEmbeddingDB = { ...spec, timestamp: Date.now() };
      await this.summaryEmbeddings.add(summaryEmbeddingDB);
      return summaryEmbeddingDB;
    });
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

  getSummaryEmbeddingByHash(hash: string): Promise<EmbeddingDB | undefined> {
    return this.summaryEmbeddings.get(hash);
  }

  async getConversationFromLeaf(leafHash: string): Promise<MessageDB[]> {
    const conversation: MessageDB[] = [];
    let currentHash: string | null = leafHash;

    while (currentHash) {
      const message = await this.getMessageByHash(currentHash);
      if (!message) break;

      conversation.push(message);
      currentHash = hasParent(message) ? message.parentHash : null;
    }

    return conversation.reverse();
  }

  async getConversationFromLeafMessage(leafMessage: MessageDB): Promise<ConversationMessages> {
    const conversation: ConversationMessages = [leafMessage];
    if (!hasParent(leafMessage)) return conversation;

    const parentMessage = await this.getMessageByHash(leafMessage.parentHash);
    if (!parentMessage) return conversation;

    return [...await this.getConversationFromLeafMessage(parentMessage), ...conversation];
  }

  // NB: concat/concatMap could be used instead of merge/mergeMap which would mean that only the events which are emitted will induce
  // queries to the database. However, this would mean that the database queries would be performed sequentially rather than in parallel.
  // Instead, we're using merge/mergeMap which means that the database queries will be performed in parallel and if we don't consume all
  // the events, we'll have wasted some queries. Because it's indexeddb, this doesn't matter, so we're going with the more aggressive option.
  getMessagesFrom(message: MessageDB | null, pathLength: number = 0, callback: (message: MessageDB, children: MessageDB[]) => boolean = () => true): Observable<LeafPath> {
    return defer(() => this.getDirectChildren(message)).pipe(
      mergeMap(children => {
        const childObservables = children.map(child => this.getMessagesFrom(child, pathLength + 1, callback));
        if (message && callback(message, children)) {
          childObservables.unshift(of({message, pathLength}));
        }
        return merge(...childObservables);
      })
    );
  }

  getLeafMessagesFrom(message: MessageDB | null, pathLength: number = 0): Observable<LeafPath> {
    return this.getMessagesFrom(message, pathLength, (_message, children) => children.length === 0);
  }

  private getDirectChildren(message: MessageDB | null) {
    return this.messages.where('parentHash').equals(message ? message.hash : rootMessageHash).reverse().sortBy('timestamp');
  }

  async searchEmbedding(embedding: number[], limit: number, table: 'embeddings' | 'summaryEmbeddings', rootMessageHash?: string): Promise<string[]> {
    let rootMessage: null | MessageDB = null;

    if (rootMessageHash) {
      rootMessage = await this.getMessageByHash(rootMessageHash) ?? null;
      if (!rootMessage) {
        // TODO: somehow this isn't finding messages by hash at all..?
        const messages = await this.messages.toArray();
        const manualFind = messages.find(message => message.hash === rootMessageHash);

        console.log("searchembedding message not found!", JSON.stringify(rootMessageHash), rootMessage, manualFind, messages);
        return [];
      }
    }

    const embeddingsObservable = this.getMessagesFrom(rootMessage).pipe(
      mergeMap(leafPath => {
        const getEmbeddingPromise = table === 'embeddings' ? this.getEmbeddingByHash(leafPath.message.hash) : this.getSummaryEmbeddingByHash(leafPath.message.hash);
        return getEmbeddingPromise.then(embedding => embedding ? {embedding, leafPath} : null);
      }),
      filter(Boolean)
    );

    let closestEmbeddings: { hash: string, distance: number }[] = [];

    return new Promise<string[]>((resolve) => {
      embeddingsObservable.subscribe(data => {
        closestEmbeddings.push({
          hash: data.leafPath.message.hash,
          distance: this.cosineSimilarity(embedding, data.embedding.embedding),
        });
        closestEmbeddings = closestEmbeddings.sort((a, b) => b.distance - a.distance).slice(0, limit);
      },
      null,
      () => {
        const result = closestEmbeddings.map(embedding => embedding.hash);
        resolve(result);
      });
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

  async addPin(message: MessageDB, remoteTimestamp: number): Promise<void> {
    const pin: PinDB = {
      hash: message.hash,
      timestamp: Date.now(),
      version: 1,
      remoteTimestamp: remoteTimestamp
    };
    await this.pins.add(pin);
  }

  async removePin(message: MessageDB): Promise<void> {
    await this.pins.where('hash').equals(message.hash).delete();
  }

  async hasPin(message: MessageDB): Promise<boolean> {
    const pin = await this.pins.get(message.hash);
    return !!pin;
  }

  async getPinnedMessages(): Promise<MessageDB[]> {
    const pins = await this.pins.toArray();
    const pinnedMessages = await Promise.all(pins.map(pin => this.getMessageByHash(pin.hash)));
    return pinnedMessages.filter((message): message is MessageDB => !!message).sort((a, b) => a.timestamp - b.timestamp);
  }
}
