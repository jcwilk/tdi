import { FileRecord, TrainingLineItem, deleteFile, fetchFileContent, fetchFiles, uploadFile } from "../openai_api";
import { isAtLeastOne } from "../tsUtils";
import { Message } from "./conversation";
import { ConversationDB, MessageDB } from "./conversationDb";
import { reprocessMessagesStartingFrom } from "./messagePersistence";
import { isParticipantRole } from "./participantSubjects";


function transformMessagesToTrainingItems(messages: Message[]): TrainingLineItem[] {
  return messages.map(message => ({
    prompt: message.role,
    completion: message.content,
  }));
}

function transformTrainingItemsToMessages(items: TrainingLineItem[]): Message[] {
  return items.map(item => {
    const role = isParticipantRole(item.prompt) ? item.prompt : 'user';
    const message = {
      role: item.prompt,
      content: item.completion,
    }
    if (isParticipantRole(message.role)) {
      return {...message, role}; // basically just a type guard
    }

    return {
      role: 'system',
      content: `Message with unknown role: ${JSON.stringify(message)}`
    }
  });
}

function messageToFilename(message: MessageDB): string {
  return `tdipins_${message.hash}_v1.jsonl`;
}

function fileToHash(file: FileRecord): string | undefined {
  const parts = file.filename.split('_');
  if (parts.length === 3 && parts[0] === 'tdipins' && parts[2] === 'v1.jsonl' && parts[1].length > 0) {
    return parts[1];
  }
  return undefined;
}

export async function pinConversationByLeaf(leafMessage: MessageDB, messagesStore: ConversationDB) {
  const messages = await messagesStore.getConversationFromLeafMessage(leafMessage);
  const trainingData = transformMessagesToTrainingItems(messages);
  const leafNode = messages[messages.length - 1];
  const file = await uploadFile(trainingData, messageToFilename(leafNode));
  await messagesStore.addPin(leafMessage, file.created_at);
}

export async function unpinConversationByLeaf(leafMessage: MessageDB, messagesStore: ConversationDB) {
  const files = await fetchFiles();
  const matchingFile = files.find(file => file.filename === messageToFilename(leafMessage));

  if (matchingFile) await deleteFile(matchingFile);

  await messagesStore.removePin(leafMessage);
}

export async function mirrorPinsToDB(db: ConversationDB): Promise<void> {
  const files = await fetchFiles();
  const hashFilePairsWithUnmatching: [string | undefined, FileRecord][] = files.map(file => [fileToHash(file), file]);
  const hashFilePairs: [string, FileRecord][] = hashFilePairsWithUnmatching.filter(([hash, _file]) => hash !== undefined) as [string, FileRecord][];

  const remoteHashes = new Set(hashFilePairs.map(([hash, _file]) => hash));

  // Import new files and add pins
  await Promise.all(hashFilePairs.map(async ([hash, file]) => {
    const persisted = await db.getMessageByHash(hash);
    if (!persisted) {
      const trainingItems = await fetchFileContent(file);
      const messages = transformTrainingItemsToMessages(trainingItems);
      if (isAtLeastOne(messages)) {
        const persistedMessage = (await reprocessMessagesStartingFrom("paused", messages)).message;
        await db.addPin(persistedMessage, file.created_at);
      }
    }
  }));

  // Remove pins not present in remote files
  const localPins = await db.getPinnedMessages();
  await Promise.all(localPins.map(async (message) => {
    if (!remoteHashes.has(message.hash)) {
      await db.removePin(message);
    }
  }));
}
