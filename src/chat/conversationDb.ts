import Dexie, { liveQuery } from 'dexie';
import { Message } from './conversation';
import { EMPTY, Observable, defer, filter, from, merge, mergeMap, of } from 'rxjs';
import { getFunctionResultsFromMessage, deserializeFunctionMessageContent, isFunctionMessageContentv1 } from './functionCalling';
import { defineConversationDBSchema } from './conversationDbMigrations';

import { isTruthy } from '../tsUtils';
import { FunctionCallMetadata, isToolFunctionCall } from '../openai_api';

// A special type for when it's between messagePersistence and being saved
export type MessageSpec = Message & {
  hash: string;
  parentHash: string;
}

type MessageDB = MessageSpec & {
  timestamp: number;
}

export type EmbellishedFunctionMessage = MessageDB & {
  role: 'function',
  results: Observable<FunctionResultDB[]>;
  functionCall: FunctionCallMetadata;
}

export function isEmbellishedFunctionMessage(message: Message): message is EmbellishedFunctionMessage {
  return message.role === "function" && "functionCall" in message && "results" in message;
}

export type PersistedMessage = BasicPersistedMessage | EmbellishedFunctionMessage;

export function isPersistedMessage(message: Message | PersistedMessage): message is PersistedMessage {
  return (message as PersistedMessage).timestamp !== undefined;
}

export function isBasicPersistedMessage(message: MessageDB | PersistedMessage): message is BasicPersistedMessage {
  return message.role === 'user' || message.role === 'assistant' || message.role === 'system';
}

export type BasicPersistedMessage = MessageDB & {
  role: 'user' | 'assistant' | 'system';
}

export type MaybePersistedMessage = Message | PersistedMessage;

export type ConversationMessages = [PersistedMessage, ...PersistedMessage[]];

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

async function dbToPersistedMessage(db: ConversationDB, message: MessageDB): Promise<PersistedMessage> {
  if (isBasicPersistedMessage(message)) return message;

  const functionMessageContent = await deserializeFunctionMessageContent(message.content);
  if (!functionMessageContent) {
    console.error('Could not deserialize function message content.', message);

    return {
      ...message,
      role: 'system',
      content: "Error: Could not deserialize function message content.",
    }
  }

  const functionResults = from(liveQuery(() => db.getFunctionResultsByUUID(functionMessageContent.uuid)));

  const functionMessage: EmbellishedFunctionMessage = {
    ...message,
    role: 'function', // mostly just to appease the type system
    results: functionResults,
    functionCall: isFunctionMessageContentv1(functionMessageContent) ? {
      name: functionMessageContent.name,
      parameters: functionMessageContent.parameters,
    } : {
      name: functionMessageContent.name,
      parameters: functionMessageContent.parameters,
      id: functionMessageContent.toolId,
    }
  };

  return functionMessage;
}

function isMessageDB(message: MaybePersistedMessage | MessageSpec): message is MessageDB {
  return (message as MessageDB).timestamp !== undefined;
}

// require messageSummary to be defined when summaryEmbedding is defined
export type MetadataHandlers = {
  'messageEmbedding'?: () => Promise<EmbeddingSpec>;
  'messageSummary'?: () => Promise<MessageSummarySpec>;
  'summaryEmbedding'?: (summary: MessageSummaryDB) => Promise<SummaryEmbeddingSpec>;
}

export type LeafPath = {
  message: PersistedMessage,
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

type FunctionResultWithResult = {
  uuid: string;
  timestamp: number;
  functionName: string;
  result: string;
  id: number;
  completed: false;
}

type FunctionResultWithCompletion = {
  uuid: string;
  timestamp: number;
  functionName: string;
  result?: never;
  id: number;
  completed: true;
}

export type FunctionResultDB = FunctionResultWithResult | FunctionResultWithCompletion;

export function isFunctionResultWithResult(result: FunctionResultDB): result is FunctionResultWithResult {
  return typeof result.result === 'string';
}

export type FunctionDependencyDB = {
  hash: string;
  timestamp: number;
  dependencyName: string;
};

// This type is exclusively used internally in the dexie class to sidestep type awkwardness around
// not getting the auto-inc id until it's persisted, but not being able to persist without an id.
type FunctionResultDBMaybeId = Partial<Pick<FunctionResultDB, 'id'>> & Omit<FunctionResultDB, 'id'>;

function isFunctionResultDB(result: FunctionResultDBMaybeId): result is FunctionResultDB {
  return typeof (result as FunctionResultDB).id === 'number';
}

type FunctionResultSpecWithResult = Omit<FunctionResultWithResult, 'timestamp' | 'id'>;
type FunctionResultSpecWithCompletion = Omit<FunctionResultWithCompletion, 'timestamp' | 'id'>;

export type FunctionResultSpec = FunctionResultSpecWithResult | FunctionResultSpecWithCompletion;

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
  functionResults: Dexie.Table<FunctionResultDBMaybeId, number>;
  functionDependencies: Dexie.Table<FunctionDependencyDB, [string, string]>;
  functionDependencies2: Dexie.Table<FunctionDependencyDB, [string, string]>;

  constructor() {
    super('ConversationDatabase');

    // To handle migrations - putting this in a separate function to avoid spamming this file too much
    defineConversationDBSchema(this);

    this.messages = this.table('messages');
    this.embeddings = this.table('embeddings');
    this.summaries = this.table('summaries');
    this.summaryEmbeddings = this.table('summaryEmbeddings');
    this.pins = this.table('pins');
    this.functionResults = this.table('functionResults');
    this.functionDependencies = this.table('functionDependencies');
    this.functionDependencies2 = this.table('functionDependencies2');
  }

  saveMessage(message: PersistedMessage | MessageSpec, metadataHandlers: MetadataHandlers): [Promise<PersistedMessage>, Promise<MetadataRecords>] {
    let persistedMessagePromise: Promise<PersistedMessage>;

    if (isMessageDB(message)) {
      persistedMessagePromise = dbToPersistedMessage(this, message);
    } else {
      persistedMessagePromise = this.transaction('rw', this.messages, () => {
        return this.getMessageByHash(message.hash)
          .then(existingMessage => {
            if (existingMessage && (hasParent(existingMessage) || hasParent(message)) && existingMessage.parentHash !== message.parentHash) {
              throw new Error(`Message with hash: ${message.hash} exists but with a different parent hash.`);
            }

            if (existingMessage) {
              return existingMessage;
            }

            if (hasParent(message)) {
              return this.getMessageByHash(message.parentHash)
                .then(parentMessage => {
                  if (!parentMessage) {
                    throw new Error(`Parent hash: ${message.parentHash} does not exist in the database.`);
                  }

                  const newMessage: MessageDB = { ...message, timestamp: Date.now() };
                  return this.messages.add(newMessage).then(() => dbToPersistedMessage(this, newMessage));
                });
            } else {
              const newMessage: MessageDB = { ...message, timestamp: Date.now() };
              return this.messages.add(newMessage).then(() => dbToPersistedMessage(this, newMessage));
            }
          });
      });
    }

    // TODO: dry these up, I'm sorry.
    const messageSummaryDBPromise = metadataHandlers['messageSummary']
      ? this.getSummaryByHash(message.hash)
        .then(summary => {
          if (summary) return summary;
          return metadataHandlers['messageSummary'] ? metadataHandlers['messageSummary']().then(summarySpec => this.saveSummary(summarySpec)) : Promise.resolve(undefined);
        })
      : Promise.resolve(undefined);

    const summaryEmbeddingDBPromise = metadataHandlers['summaryEmbedding']
      ? messageSummaryDBPromise.then(summary => {
        if (!summary) throw new Error('MessageSummary must be specified when SummaryEmbedding is specified.');

        return this.getSummaryEmbeddingByHash(message.hash)
          .then(embedding => {
            if (embedding) return embedding;
            return metadataHandlers['summaryEmbedding'] ? metadataHandlers['summaryEmbedding'](summary).then(embeddingSpec => this.saveSummaryEmbedding(embeddingSpec)) : Promise.resolve(undefined);
          });
      })
      : Promise.resolve(undefined);

    const messageEmbeddingDBPromise = metadataHandlers['messageEmbedding']
      ? this.getEmbeddingByHash(message.hash)
        .then(embedding => {
          if (embedding) return embedding;
          return metadataHandlers['messageEmbedding'] ? metadataHandlers['messageEmbedding']().then(embeddingSpec => this.saveMetadata(embeddingSpec)) : Promise.resolve(undefined);
        })
      : Promise.resolve(undefined);

    const metadataRecordsPromise = Promise.all([messageSummaryDBPromise, summaryEmbeddingDBPromise, messageEmbeddingDBPromise])
      .then(([messageSummary, summaryEmbedding, messageEmbedding]) => {
        const metadataRecords: MetadataRecords = {
          messageEmbedding,
          messageSummary,
          summaryEmbedding,
        };

        assertKeysMatch(metadataHandlers, metadataRecords);
        return metadataRecords;
      });

    return [persistedMessagePromise, metadataRecordsPromise];
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
      await this.embeddings.add(embeddingDB);
      return embeddingDB;
    });
  }

  async getMessageByHash(hash: string): Promise<PersistedMessage | undefined> {
    const message = await this.messages.get(hash);
    return message && dbToPersistedMessage(this, message);
  }

  getEmbeddingByHash(hash: string): Promise<EmbeddingDB | undefined> {
    return this.embeddings.get(hash);
  }

  getSummaryEmbeddingByHash(hash: string): Promise<EmbeddingDB | undefined> {
    return this.summaryEmbeddings.get(hash);
  }

  async getConversationFromLeaf(leafHash: string): Promise<PersistedMessage[]> {
    const conversation: PersistedMessage[] = [];
    let currentHash: string | null = leafHash;

    while (currentHash) {
      const message = await this.getMessageByHash(currentHash);
      if (!message) break;

      conversation.push(message);
      currentHash = hasParent(message) ? message.parentHash : null;
    }

    return conversation.reverse();
  }

  async getConversationFromLeafMessage(leafMessage: PersistedMessage): Promise<ConversationMessages> {
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
  private getMessagesFrom(message: PersistedMessage | null, pathLength: number = 0, callback: (message: PersistedMessage, children: PersistedMessage[]) => boolean = () => true, maxDepth?: number): Observable<LeafPath> {
    if (maxDepth !== undefined && pathLength > maxDepth) return EMPTY;

    return defer(() => this.getDirectChildren(message)).pipe(
      mergeMap(children => {
        const childObservables = children.map(child => this.getMessagesFrom(child, pathLength + 1, callback, maxDepth));
        if (message && callback(message, children)) {
          childObservables.unshift(of({message, pathLength}));
        }
        return merge(...childObservables);
      })
    );
  }

  getLeafMessagesFrom(message: PersistedMessage | null, pathLength: number = 0): Observable<LeafPath> {
    return this.getMessagesFrom(message, pathLength, (_message, children) => children.length === 0);
  }

  async getDirectChildren(message: PersistedMessage | null): Promise<PersistedMessage[]> {
    const messages = await this.messages.where('parentHash').equals(message ? message.hash : rootMessageHash).reverse().sortBy('timestamp')
    return Promise.all(messages.map (message => dbToPersistedMessage(this, message)));
  }

  async getDirectSiblings(message: PersistedMessage): Promise<PersistedMessage[]> {
    const messages = await this.messages.where('parentHash').equals(message.parentHash ?? "").sortBy('timestamp');
    return Promise.all(messages.map (message => dbToPersistedMessage(this, message)));
  }

  async searchEmbedding(embedding: number[], limit: number, table: 'embeddings' | 'summaryEmbeddings', rootMessageHash?: string, maxDepth?: number): Promise<string[]> {
    let rootMessage: null | PersistedMessage = null;

    if (rootMessageHash) {
      rootMessage = await this.getMessageByHash(rootMessageHash) ?? null;
      if (!rootMessage) {
        throw new Error(`searchembedding message not found! ${rootMessageHash}`);
      }
    }

    const embeddingsObservable = this.getMessagesFrom(rootMessage, 0, () => true, maxDepth).pipe(
      mergeMap(leafPath => {
        const getEmbeddingPromise = table === 'embeddings' ? this.getEmbeddingByHash(leafPath.message.hash) : this.getSummaryEmbeddingByHash(leafPath.message.hash);
        return getEmbeddingPromise.then(embedding => embedding ? {embedding, leafPath} : null);
      }),
      filter(Boolean)
    );

    // This is a slow but functional version of a priority queue. If performance becomes an issue then it can be upgraded as-needed.
    let closestEmbeddings: { hash: string, distance: number }[] = [];

    return new Promise<string[]>((resolve) => {
      const self = this;
      embeddingsObservable.subscribe({
        next(data) {
          closestEmbeddings.push({
            hash: data.leafPath.message.hash,
            distance: self.cosineSimilarity(embedding, data.embedding.embedding),
          });
          closestEmbeddings = closestEmbeddings.sort((a, b) => b.distance - a.distance).slice(0, limit);
        },
        complete() {
          const result = closestEmbeddings.map(embedding => embedding.hash);
          resolve(result);
        }
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

  private async getLeafMessageFromAncestorHelper(message: MessageDB): Promise<MessageDB> {
    const children = await this.messages.where('parentHash').equals(message.hash).sortBy('timestamp');
    if (children.length === 0) {
        return message;  // No children, message is a leaf node
    }
    // Recurse with the oldest child
    return this.getLeafMessageFromAncestorHelper(children[0]);
  }

  async getLeafMessageFromAncestor(message: PersistedMessage): Promise<PersistedMessage> {
    const messageDB = await this.getLeafMessageFromAncestorHelper(message);
    return dbToPersistedMessage(this, messageDB);
  }

  async addPin(message: PersistedMessage, remoteTimestamp: number): Promise<void> {
    this.transaction('rw', this.pins, async () => {
      if (await this.hasPin(message)) return;

      const pin: PinDB = {
        hash: message.hash,
        timestamp: Date.now(),
        version: 1,
        remoteTimestamp: remoteTimestamp
      };
      await this.pins.add(pin);
    });
  }

  async removePin(message: PersistedMessage): Promise<void> {
    this.transaction('rw', this.pins, async () => {
      await this.pins.where('hash').equals(message.hash).delete();
    });
  }

  async hasPin(message: PersistedMessage): Promise<boolean> {
    const pin = await this.pins.get(message.hash);
    return !!pin;
  }

  async getPinnedMessages(): Promise<PersistedMessage[]> {
    const pins = await this.pins.toArray();
    const pinnedMessages = await Promise.all(pins.map(pin => this.getMessageByHash(pin.hash)));
    return pinnedMessages.filter(isTruthy).sort((a, b) => a.timestamp - b.timestamp);
  }

  async saveFunctionResult(spec: FunctionResultSpec): Promise<FunctionResultDB> {
    const functionResultDB: FunctionResultDBMaybeId = {
      ...spec,
      timestamp: Date.now()
    };
    const id = await this.functionResults.add(functionResultDB);
    return { ...functionResultDB, id } as FunctionResultDB;
  }

  async getFunctionResultsByUUID(uuid: string): Promise<FunctionResultDB[]> {
    return (await this.functionResults.where('uuid').equals(uuid).sortBy('id')).filter(isFunctionResultDB);
  }

  async saveFunctionDependency(message: PersistedMessage, dependencyName: string): Promise<FunctionDependencyDB> {
    return this.transaction('rw', [this.functionResults, this.functionDependencies], async () => {
      const dependencyDB: FunctionDependencyDB = {
        hash: message.hash,
        timestamp: Date.now(),
        dependencyName,
      };

      const functionResults = await getFunctionResultsFromMessage(this, message);

      if (!functionResults) throw new Error('Cannot add dependency to a non-function message.');
      if (functionResults.some(result => result.completed)) throw new Error('Cannot add dependency to completed function result.');

      await this.functionDependencies.add(dependencyDB);
      return dependencyDB;
    });
  }

  async getFunctionDependenciesByHash(hash: string): Promise<FunctionDependencyDB[]> {
    return this.functionDependencies.where('hash').equals(hash).toArray();
  }
}
