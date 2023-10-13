import { ConversationDB, MaybePersistedMessage, MessageDB, isMessageDB } from './conversationDb';
import { Message } from './conversation';
import { getEmbedding } from '../openai_api';

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

export async function processMessagesWithHashing(
  message: MaybePersistedMessage,
  currentParentHashes: string[] = []
): Promise<MessageDB> {
  const hash = await hashFunction(message, currentParentHashes);
  if (isMessageDB(message) && message.hash === hash) {
    return message;
  }

  const conversationDB = new ConversationDB();
  const messageDB: MessageDB = {
    ...message,
    timestamp: Date.now(),
    hash: hash,
    parentHash: currentParentHashes[0],
    embedding: await getEmbedding(message.content)
  };

  return await conversationDB.saveMessage(messageDB);
};

const identifyMessagesForReprocessing = (conversation: MessageDB[], startIndex: number): Message[] => {
  return conversation.slice(startIndex).map(message => ({
    content: message.content,
    role: message.role
  }));
};

export async function reprocessMessagesStartingFrom(messagesForReprocessing: Message[], parentMessage?: MessageDB): Promise<MessageDB> {
  if (messagesForReprocessing.length === 0) {
    throw new Error("No messages to reprocess");
  }

  if (!parentMessage) {
    parentMessage = await processMessagesWithHashing(messagesForReprocessing[0]);
    messagesForReprocessing = messagesForReprocessing.slice(1);
  }

  return messagesForReprocessing.reduce<Promise<MessageDB>>((acc, message) => acc.then(accMessage => processMessagesWithHashing(message, accMessage ? [accMessage.hash] : [])), Promise.resolve(parentMessage));
}

export async function editConversation(
  leafMessage: MessageDB,
  originalMessage: MessageDB,
  newMessage: Message
): Promise<MessageDB> {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const conversation = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  const index = findIndexByProperty(conversation, 'hash', originalMessage.hash);

  if (index < 0 || index >= conversation.length) {
    console.error("Invalid index - message not found");
    return leafMessage;
  }

  // The messages before the index remain untouched.
  const precedingMessages = conversation.slice(0, index);

  // Starting the reprocessing from the last preceding message
  const parentMessage = precedingMessages[precedingMessages.length - 1] ?? undefined;

  // We'll need to reprocess the message at the given index and any subsequent messages.
  const messagesForReprocessing = identifyMessagesForReprocessing(conversation, index);
  //console.log("messagesForReprocessing: ", messagesForReprocessing);
  messagesForReprocessing[0] = newMessage;  // Replace the message at the given index with the new message

  return reprocessMessagesStartingFrom(messagesForReprocessing, parentMessage);
};

export async function pruneConversation(
  leafMessage: MessageDB,
  excludedMessage: MessageDB
): Promise<MessageDB> {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const conversation = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  // Determine the first excluded message index
  const firstExcludedIndex = conversation.findIndex(message => excludedMessage.hash == message.hash);

  // If no excluded message is found, return the leaf as is.
  if (firstExcludedIndex === -1) {
    return leafMessage;
  }

  // All messages before the first excluded index remain untouched.
  const precedingMessages = conversation.slice(0, firstExcludedIndex);

  // If there are no messages to reprocess after the excluded message, return the last preceding message as the new leaf
  if (firstExcludedIndex === conversation.length - 1) {
    return precedingMessages[precedingMessages.length - 1];
  }

  // The parent hash for the next reprocessed message would be the hash of the message before the first excluded one.
  const parentMessage = firstExcludedIndex === 0 ? undefined : precedingMessages[precedingMessages.length - 1];

  // Identify the messages for reprocessing starting from the first excluded message index
  const messagesForReprocessing = identifyMessagesForReprocessing(conversation, firstExcludedIndex + 1);

  if (messagesForReprocessing.length > 0) {
    return reprocessMessagesStartingFrom(messagesForReprocessing, parentMessage);
  }

  return precedingMessages[precedingMessages.length - 1];
};
