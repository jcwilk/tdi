import { EMPTY, Observable, from, of } from "rxjs";
import * as RxJS from "rxjs";
import { ConversationDB, FunctionDependencyDB } from "../chat/conversationDb";
import { DynamicFunctionWorkerPayload, DynamicFunctionWorkerResponse, FunctionMessageContent, deserializeFunctionMessageContent, isDynamicFunctionMessageContent, isFunctionMessage } from "../chat/functionCalling";

const db = new ConversationDB();

function coerceInputOrReturn(input?: string | string[] | Observable<string>): Observable<string> {
  if (input === undefined) return EMPTY;
  if (typeof input === "string") return of(input);
  if (Array.isArray(input)) return from(input);

  return input;
}

async function buildFunction(functionHash: string): Promise<string> {
  console.log("buildFunction", functionHash);
  const functionMessage = await db.getMessageByHash(functionHash);
  if (!functionMessage) throw new Error(`Function message with hash "${functionHash}" not found.`);
  if (!isFunctionMessage(functionMessage)) throw new Error(`Message with hash "${functionHash}" is not a function message.`);

  const functionMessageContent = deserializeFunctionMessageContent(functionMessage.content);
  if (!functionMessageContent) throw new Error("Invalid function message content");
  if (!isDynamicFunctionMessageContent(functionMessageContent)) throw new Error("Function message is not an invocation of generate_dynamic_function.");

  const functionDependencies = await db.getFunctionDependenciesByHash(functionMessage.hash);

  const dependencyMappings = await Promise.all(
    functionDependencies.map((functionDependency: FunctionDependencyDB) => {
      return buildFunction(functionDependency.dependencyName)
        .then(builtFunction => `"${functionDependency.dependencyName}": (${builtFunction})(utils),`);
    })
  );
  const dependencyMapping = `{\n${dependencyMappings.join("\n")}\n}`;

  return `
    (utils) => (input) => {
      console.log("utils", utils);
      const { RxJS } = utils;
      const dependencies = ${dependencyMapping};
      input = coerceInputOrReturn(input);
      return coerceInputOrReturn((() => {
        ${functionMessageContent.parameters.functionBody}
      })())
    }
  `
}

self.addEventListener('message', async (event) => {
  const data: DynamicFunctionWorkerPayload = event.data;
  const { functionHash, input, functionOptions } = data;

  const builtFunctionString = await buildFunction(functionHash);
  console.log("builtFunctionString", builtFunctionString);

  const builtFunction = eval(builtFunctionString);
  const results: Observable<string> = builtFunction({ RxJS })(input);

  results.subscribe({
    next: (result: string) => {
      const progress: DynamicFunctionWorkerResponse = {
        status: "incomplete",
        content: result
      }
      self.postMessage(progress);
    },
    complete: () => {
      const completion: DynamicFunctionWorkerResponse = {
        status: "complete"
      }
      self.postMessage(completion);
    }
  });
});
