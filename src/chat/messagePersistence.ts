import { Observable, pipe } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { ConversationDB, MessageDB } from './conversationDb';
import { Message } from './conversation';

const hashFunction = async (message: MessageDB, parentHashes: string[]): Promise<string> => {
  // Serialize the message
  const serializedMessage = JSON.stringify(message);

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
  let lastMessageHashes = initialParentHashes;

  const conversationDB = new ConversationDB(); // The DB class provided earlier

  return source$.pipe(
    map((message): MessageDB => {
      // Augmentation
      return {
        ...message,
        timestamp: Date.now(),
        hash: '' // Temporary placeholder, will replace later
      };
    }),
    // TODO: do we need to worry about order issues with mergemap?
    mergeMap(async (messageDB): Promise<MessageDB> => {
      // Hashing
      console.log("hashing...")
      messageDB.hash = await hashFunction(messageDB, lastMessageHashes);
      return messageDB;
    }),
    mergeMap(async (messageDB) => {
      // Persistence
      console.log("persisting...")
      await conversationDB.saveMessage(messageDB, lastMessageHashes);
      lastMessageHashes = [messageDB.hash];
      return messageDB; // Returning processed message
    })
  );
};

export { processMessagesWithHashing };
