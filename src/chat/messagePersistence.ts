import { Observable, from, lastValueFrom, pipe } from 'rxjs';
import { concatMap, map, mergeMap, scan } from 'rxjs/operators';
import { ConversationDB, MessageDB } from './conversationDb';
import { Message } from './conversation';

const hashFunction = async (message: MessageDB, parentHashes: string[]): Promise<string> => {
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

const processMessagesWithHashing = (
  source$: Observable<Message>,
  initialParentHashes: string[] = []
): Observable<MessageDB> => {
  const conversationDB = new ConversationDB();

  let lastProcessedHash: string | null = null;

  return source$.pipe(
    map((message): MessageDB => {
      return {
        ...message,
        timestamp: Date.now(),
        hash: ''
      };
    }),
    concatMap(async (messageDB, index): Promise<MessageDB> => {
      const currentParentHashes = index === 0 ? initialParentHashes : (lastProcessedHash ? [lastProcessedHash] : []);

      messageDB.hash = await hashFunction(messageDB, currentParentHashes);
      console.log("persisting...");
      const persistedMessage = await conversationDB.saveMessage(messageDB, currentParentHashes);

      // Update the lastProcessedHash after processing the current message
      lastProcessedHash = persistedMessage.hash;

      return persistedMessage;
    })
  );
};

const identifyMessagesForReprocessing = (conversation: MessageDB[], startIndex: number): Message[] => {
  return conversation.slice(startIndex).map(message => ({
    content: message.content,
    participantId: message.participantId,
    role: message.role
  }));
};

const editConversation = async (
  leafMessage: MessageDB,
  index: number,
  newMessage: Message
): Promise<MessageDB> => {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const conversation = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  if (index < 0 || index >= conversation.length) {
    throw new Error("Invalid index");
  }

  // The messages before the index remain untouched.
  const precedingMessages = conversation.slice(0, index);

  // The parent hash for the newMessage would be the hash of the message before the given index.
  const parentHashes = index === 0 ? [] : [precedingMessages[precedingMessages.length - 1].hash];

  // We'll need to reprocess the message at the given index and any subsequent messages.
  const messagesForReprocessing = identifyMessagesForReprocessing(conversation, index);
  messagesForReprocessing[0] = newMessage;  // Replace the message at the given index with the new message

  // Convert the array of Messages to an Observable and process with hashing
  const source$ = from(messagesForReprocessing);
  const newMessages$ = processMessagesWithHashing(source$, parentHashes);

  // Convert Observable to Promise and wait for completion
  const newLeafMessage = await lastValueFrom(newMessages$);

  return newLeafMessage;
};

const pruneConversation = async (
  leafMessage: MessageDB,
  excludedHashes: string[]
): Promise<MessageDB> => {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const conversation = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  // Determine the first excluded message index
  const firstExcludedIndex = conversation.findIndex(message => excludedHashes.includes(message.hash));

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
  const parentHashes = firstExcludedIndex === 0 ? [] : [precedingMessages[precedingMessages.length - 1].hash];

  // Identify the messages for reprocessing starting from the first excluded message index
  const messagesForReprocessing = identifyMessagesForReprocessing(conversation, firstExcludedIndex + 1);

  console.log("REPRO", messagesForReprocessing, parentHashes)

  if (messagesForReprocessing.length > 0) {
    // Convert the array of Messages to an Observable and process with hashing
    const source$ = from(messagesForReprocessing);
    const newMessages$ = processMessagesWithHashing(source$, parentHashes);

    // Convert Observable to Promise and wait for completion
    return await lastValueFrom(newMessages$);
  }

  return precedingMessages[precedingMessages.length - 1];
};

export { processMessagesWithHashing, editConversation, pruneConversation };
