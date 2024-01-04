import { ConversationDB, MaybePersistedMessage, MessageSpec, MessageSummaryDB, MetadataHandlers, MetadataRecords, PersistedMessage, isPersistedMessage, rootMessageHash } from './conversationDb';
import { ConversationMode, Message } from './conversation';
import { getEmbedding } from '../openai_api';
import { isAtLeastOne } from '../tsUtils';
import { chatCompletionMetaStream, isGPTSentMessage } from './chatStreams';
import { filter, firstValueFrom, map } from 'rxjs';
import { isAPIKeySet } from '../api_key_storage';

const hashFunction = async (message: Message, parentHashes: string[]): Promise<string> => {
  // Extract the required fields
  const { content, role } = message;

  // Serialize the required fields
  const serializedMessage = JSON.stringify({ content, role });

  // Concatenate with parent hashes
  const dataForHashing = parentHashes.reduce((acc, hash) => acc + hash, serializedMessage);

  // Produce the SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataForHashing));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
};

function findIndexByProperty<T>(arr: T[], property: keyof T, value: T[keyof T]): number {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][property] === value) {
      return i;
    }
  }
  return -1; // Return -1 if no match is found
}

type ProcessedMessageResultNullObject = {
  message: null,
  metadataRecordsPromise: Promise<MetadataRecords>
}

type ProcessedMessageResult = {
  message: PersistedMessage,
  metadataRecordsPromise: Promise<MetadataRecords>
}

export type MaybeProcessedMessageResult = ProcessedMessageResultNullObject | ProcessedMessageResult;

export const NULL_OBJECT_PROCESSED_MESSAGE_RESULT: ProcessedMessageResultNullObject = {
  message: null,
  metadataRecordsPromise: Promise.resolve({})
} as const;

function escapeSummaryValues(text: string) {
  return text.replace(/\"\"\"/g, "\\\"\\\"\\\"");
}

function buildSummaryPayload(priorSummary: string, newMessage: Message) {
  priorSummary = escapeSummaryValues(priorSummary);
  const newMessageContent = escapeSummaryValues(newMessage.content);
  return `Given the following two texts to combine:\n\nNew Message (${newMessage.role}): \"\"\"\n${newMessageContent}\n\"\"\"\n\nPrior Conversation Summary: \"\"\"\n${priorSummary}\n\"\"\"\n\nPlease generate a summary of the overall conversation.`;
}

async function recursivelySummarize(newMessage: Message, priorResult: MaybeProcessedMessageResult): Promise<string> {
  const priorSummary = (await priorResult.metadataRecordsPromise).messageSummary?.summary ?? "";
  const payload = buildSummaryPayload(priorSummary, newMessage);

  const fewShotPayload = buildSummaryPayload(
    "A series of exercise instructions have been recommended including sit ups, push ups, chin ups with further advice offered. Inquiries have been made about exercise activities for the purposes of strength training.",
    {role: "user", content: "That all seems kind of hard though..."}
  )

  const observer = chatCompletionMetaStream(
    [
      {
        "role": "system",
        "content": "As an AI, your task is to generate a summary that blends the contents of the prior summary (80%) with the new message (20%) without explicitly indicating which the new content came from. The new output should prioritize the content of the prior summary. Analyze the new message for key themes, but ensure they don't overshadow the content from the prior summary. The goal is a summary that maintains the context and flow, and is representative of the entire discussion up to this point. These summaries will be used for embeddings and message search, so they should be informative and detailed. The objective is a predictable, understandable summary that aids users in contextual search. Only phase out components from the prior summary if they are explicitly contradicted or negated in the new message."
      },
      {
        "role": "user",
        "content": fewShotPayload
      },
      {
        "role": "assistant",
        "content": "Concern is expressed at the difficulty of the exercises. A series of exercise instructions have been recommended including sit ups, push ups, chin ups."
      },
      {
        "role": "user",
        "content": payload
      }
    ],
    0.1,
    "gpt-4",
    100, // change size of summary here
  )
  return firstValueFrom(observer.pipe(
    filter(isGPTSentMessage),
    map(message => message.text)
  ))
}

export async function processMessagesWithHashing(
  db: ConversationDB,
  conversationMode: ConversationMode,
  message: MaybePersistedMessage,
  priorResult: MaybeProcessedMessageResult
): Promise<ProcessedMessageResult> {
  if (!isAPIKeySet()) conversationMode = 'paused';

  const parentHash = priorResult.message ? priorResult.message.hash : rootMessageHash;
  const hash = await hashFunction(message, [parentHash]);

  let messageToSave: PersistedMessage | MessageSpec;

  // If the message is a PersistedMessage and its hash matches
  if (isPersistedMessage(message) && message.hash === hash) {
    messageToSave = message;
  }
  else {
    const newMessage: MessageSpec = {
      content: message.content,
      role: message.role,
      hash,
      parentHash: parentHash
    };
    messageToSave = newMessage;
  }

  const unconditionalHandlers = {
    messageEmbedding: async () => {
      const embedding = await getEmbedding(message.content);
      return {
        hash: messageToSave.hash,
        embedding: embedding,
      };
    }
  }

  const unpausedHandlers = {
    messageSummary: async () => {
      const summary = await recursivelySummarize(message, priorResult);
      return {
        hash: messageToSave.hash,
        summary: summary,
      };
    },
    summaryEmbedding: async (summary: MessageSummaryDB) => {
      const embedding = await getEmbedding(summary.summary);
      return {
        hash: messageToSave.hash,
        embedding: embedding,
      };
    },

  }
  const metadataHandlers: MetadataHandlers = conversationMode === 'paused' ? unconditionalHandlers : { ...unconditionalHandlers, ...unpausedHandlers };

  const [persistedMessagePromise, metadataRecordsPromise] = db.saveMessage(messageToSave, metadataHandlers);
  return { message: await persistedMessagePromise, metadataRecordsPromise };
};

const identifyMessagesForReprocessing = (conversation: PersistedMessage[], startIndex: number): Message[] => {
  return conversation.slice(startIndex).map(message => ({
    content: message.content,
    role: message.role
  }));
};

export async function reprocessMessagesStartingFrom(db: ConversationDB, conversationMode: ConversationMode, messagesForReprocessing: [MaybePersistedMessage, ...MaybePersistedMessage[]]): Promise<[ProcessedMessageResult, ...ProcessedMessageResult[]]> {
  let accResult = await processMessagesWithHashing(db, conversationMode, messagesForReprocessing[0], NULL_OBJECT_PROCESSED_MESSAGE_RESULT);
  const results: [ProcessedMessageResult, ...ProcessedMessageResult[]] = [accResult];

  const remainingMessages = messagesForReprocessing.slice(1);

  if(!isAtLeastOne(remainingMessages)) return results;

  for (const message of remainingMessages) {
    accResult = await processMessagesWithHashing(db, conversationMode, message, accResult);
    results.push(accResult);
  }

  return results;
}

export async function editConversation(
  conversationMode: ConversationMode,
  leafMessage: PersistedMessage,
  originalMessage: PersistedMessage,
  newMessage: Message
): Promise<PersistedMessage> {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const allMessages = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  const index = findIndexByProperty(allMessages, 'hash', originalMessage.hash);

  if (index < 0 || index >= allMessages.length) {
    console.error("Invalid index - message not found");
    return leafMessage;
  }

  // The messages before the index remain untouched.
  const precedingMessages = allMessages.slice(0, index);

  // We'll need to reprocess the message at the given index and any subsequent messages.
  const originalMessagesForReprocessing = identifyMessagesForReprocessing(allMessages, index);

  const fullMessagesForReprocessing = [...precedingMessages, newMessage, ...originalMessagesForReprocessing.slice(1)];

  if (!isAtLeastOne(fullMessagesForReprocessing)) {
    console.error("No messages for reprocessing in an unexpected place in edit")
    return leafMessage;
  }

  // Replace the message at the given index with the new message
  const newMessages = await reprocessMessagesStartingFrom(conversationDB, conversationMode, fullMessagesForReprocessing);
  return newMessages[newMessages.length - 1].message;
};

export async function pruneConversation(
  conversationMode: ConversationMode,
  leafMessage: PersistedMessage,
  excludedMessage: PersistedMessage
): Promise<PersistedMessage> {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const allMessages = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  // Determine the first excluded message index
  const firstExcludedIndex = allMessages.findIndex(message => excludedMessage.hash == message.hash);

  // If no excluded message is found, return the leaf as is.
  if (firstExcludedIndex === -1) {
    return leafMessage;
  }

  // All messages before the first excluded index remain untouched.
  const precedingMessages = allMessages.slice(0, firstExcludedIndex);

  // If there are no messages to reprocess after the excluded message, return the last preceding message as the new leaf
  if (firstExcludedIndex === allMessages.length - 1) {
    return precedingMessages[precedingMessages.length - 1];
  }

  // Identify the messages for reprocessing starting from the first excluded message index
  const messagesForReprocessing = identifyMessagesForReprocessing(allMessages, firstExcludedIndex + 1);

  const fullMessagesForReprocessing = [...precedingMessages, ...messagesForReprocessing];

  if (!isAtLeastOne(fullMessagesForReprocessing)) {
    return precedingMessages[precedingMessages.length - 1];
  }

  const newMessages = await reprocessMessagesStartingFrom(conversationDB, conversationMode, fullMessagesForReprocessing);
  return newMessages[newMessages.length - 1].message;
};
