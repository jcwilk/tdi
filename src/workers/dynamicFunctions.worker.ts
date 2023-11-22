import { ConversationDB } from "../chat/conversationDb";
import { DynamicFunctionWorkerPayload, DynamicFunctionWorkerResponse, deserializeFunctionMessageContent, isFunctionMessage } from "../chat/functionCalling";

const db = new ConversationDB();

self.addEventListener('message', async (event) => {
  const data: DynamicFunctionWorkerPayload = event.data;
  const { functionHash, input, functionOptions } = data;

  const functionMessage = await db.getMessageByHash(functionHash);
  if (!functionMessage) throw new Error(`Function message with hash "${functionHash}" not found.`);
  if (!isFunctionMessage(functionMessage)) throw new Error(`Message with hash "${functionHash}" is not a function message.`);

  const functionMessageContent = deserializeFunctionMessageContent(functionMessage.content);
  if (!functionMessageContent) throw new Error("Invalid function message content");

  const functionDependencies = await db.getFunctionDependenciesByHash(functionMessage.hash);

  const progress: DynamicFunctionWorkerResponse = {
    status: "incomplete",
    content: "test!"
  }
  self.postMessage(progress);

  const completion: DynamicFunctionWorkerResponse = {
    status: "complete"
  }
  self.postMessage(completion);
});
