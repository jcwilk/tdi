import { Observable, from, lastValueFrom, pipe } from 'rxjs';
import { concatMap, map, mergeMap, scan } from 'rxjs/operators';
import { ConversationDB, MessageDB } from './conversationDb';
import { Message } from './conversation';

const hashFunction = async (message: MessageDB, parentHashes: string[]): Promise<string> => {
  // Serialize the message
  const serializedMessage = JSON.stringify(message);
  // TODO: consider changing the fields that are getting serialized, it would be nice if a duplicate convo ended up with a duplicate SHA

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
      await conversationDB.saveMessage(messageDB, currentParentHashes);

      // Update the lastProcessedHash after processing the current message
      lastProcessedHash = messageDB.hash;

      return messageDB;
    })
  );
};

const rebaseConversation = async (
  leafMessage: MessageDB,
  excludedHashes: string[]
): Promise<MessageDB> => {
  const conversationDB = new ConversationDB();

  // Fetch the full conversation from the leaf to the root
  const conversation = await conversationDB.getConversationFromLeaf(leafMessage.hash);

  // Initialize parentHashes with an empty array for the root
  let parentHashes: string[] = [];

  // To store the newly created leaf message
  let newLeafMessage: MessageDB = { ...leafMessage };

  // Flag to indicate if messages need to be reprocessed from this point onward
  let requiresReprocessing = false;

  // Array to store Messages needing reprocessing
  let messagesForReprocessing: Message[] = [];

  // Process the conversation messages in order, from root to leaf
  for (const message of conversation) {
    // Skip any excluded messages and set the flag for reprocessing
    if (excludedHashes.includes(message.hash)) {
      requiresReprocessing = true;
      continue;
    }

    if (requiresReprocessing) {
      // Convert MessageDB to Message
      messagesForReprocessing.push({
        content: message.content,
        participantId: message.participantId,
        role: message.role
      });
    } else {
      // If we are not in reprocessing mode, the parent for the next message
      // is simply the hash of the current message
      parentHashes = [message.hash];
      newLeafMessage = message;
    }
  }

  console.log("REPRO", messagesForReprocessing, parentHashes)

  if (messagesForReprocessing.length > 0) {
    // Convert the array of Messages to an Observable and process with hashing
    const source$ = from(messagesForReprocessing);
    const newMessages$ = processMessagesWithHashing(source$, parentHashes);

    // Convert Observable to Promise and wait for completion
    newLeafMessage = await lastValueFrom(newMessages$);
  }

  return newLeafMessage;
};

export { processMessagesWithHashing, rebaseConversation };
