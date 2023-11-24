import { EMPTY, Observable, from, isObservable, of } from "rxjs";
import * as RxJS from "rxjs";
import { ConversationDB, FunctionDependencyDB } from "../chat/conversationDb";
import { DynamicFunctionWorkerPayload, DynamicFunctionWorkerResponse, FunctionReturn, coerceAndOrderFunctionParameters, deserializeFunctionMessageContent, functionSpecs, isDynamicFunctionMessageContent, isFunctionMessage } from "../chat/functionCalling";
import { FunctionParameters } from "../openai_api";

const db = new ConversationDB();

function coerceInputOrReturn(input: FunctionReturn): Observable<string> {
  if (isObservable(input)) return input;
  if (input === undefined) return EMPTY;
  if (typeof input === "string") return of(input);

  // handles either a string[] or a Promise<string>
  return from(input);
}

async function buildFunction(functionHash: string, staticFunctionNames: string[]): Promise<string> {
  const functionMessage = await db.getMessageByHash(functionHash);

  if (!functionMessage) throw new Error(`Function message with hash "${functionHash}" not found.`);
  if (!isFunctionMessage(functionMessage)) throw new Error(`Message with hash "${functionHash}" is not a function message.`);

  const functionMessageContent = deserializeFunctionMessageContent(functionMessage.content);
  if (!functionMessageContent) throw new Error("Invalid function message content");
  if (!isDynamicFunctionMessageContent(functionMessageContent)) throw new Error("Function message is not an invocation of generate_dynamic_function.");

  const functionDependencies = await db.getFunctionDependenciesByHash(functionMessage.hash);
  const dynamicFunctionDependencies = functionDependencies.filter(functionDependency => !staticFunctionNames.includes(functionDependency.dependencyName));

  const dynamicDependencyMappings = await Promise.all(
    dynamicFunctionDependencies.map((functionDependency: FunctionDependencyDB) => {
      return buildFunction(functionDependency.dependencyName, staticFunctionNames)
        .then(builtFunction => `"${functionDependency.dependencyName}": (${builtFunction})(utils),`);
    })
  );
  const dynamicDependencyMapping = `{\n${dynamicDependencyMappings.join("\n")}\n}`;

  // NB: allStaticDependencies gets remapped to staticDependencies for the benefit of the dependent functions because
  // we want to resrict the static dependencies to only those that are explicitly requested by the function. However,
  // we do not want to do that same restriction for its dependencies, so we pass allStaticDependencies to them instead.
  return `
    (utils) => (input) => {
      const { RxJS } = utils;
      utils = { RxJS, staticDependencies: utils.allStaticDependencies, allStaticDependencies: utils.allStaticDependencies };

      const dependencies = {...utils.staticDependencies, ...${dynamicDependencyMapping}};
      input = coerceInputOrReturn(input);
      {
        const utils = undefined;
        const returnVal = (() => {
          ${functionMessageContent.parameters.functionBody}
        })();
        const coercedReturn = coerceInputOrReturn(returnVal);
        return coercedReturn;
      }
    }
  `
}

const denylistedFunctionNames = [
  "generate_dynamic_function",
  "invoke_dynamic_function",
]

self.addEventListener('message', async (event) => {
  if (event.data.SET_API_KEY) {
    // SUPER gross hack, I'm so sorry to anyone who is reading this.
    // I made the unfortunate choice of using localstorage for storing the API key, but localstorage is not available
    // in web workers. I'd love to refactor my API code, but the initial launch deadline approaches.
    // On the plus side, it's not particularly dangerous, just very confusing and hacky.
    self.localStorage = {
      getItem: () => event.data.SET_API_KEY,
    } as any;
    return;
  }

  const data: DynamicFunctionWorkerPayload = event.data;
  const { functionHash, input, functionOptions } = data;

  const allowedFunctionSpecs = functionSpecs.filter(functionSpec => !denylistedFunctionNames.includes(functionSpec.name));
  const allStaticDependencies = allowedFunctionSpecs.reduce((acc, functionSpec) => {
    const minParams = functionSpec.parameters.filter(param => param.required).length;
    const maxParams = functionSpec.parameters.length;
    acc[functionSpec.name] = (rawInput: FunctionParameters) => {
      //console.log("rawInput", rawInput)
      return new Observable<string>(subscriber => {
        let inputArray: any[];
        try {
          inputArray = coerceAndOrderFunctionParameters(rawInput, functionSpec);
        } catch(err) {
          subscriber.error(err);
          return;
        }

        //console.log("corrected input", inputArray)

        if (inputArray.length < minParams) {
          subscriber.error(`Function ${functionSpec.name} requires at least ${minParams} parameters.`);
          return;
        }
        if (inputArray.length > maxParams) {
          subscriber.error(`Function ${functionSpec.name} accepts at most ${maxParams} parameters.`);
          return;
        }
        const result = coerceInputOrReturn(functionSpec.implementation({ db }, ...inputArray));

        const subscription = result.subscribe({
          next: value => subscriber.next(value),
          error: err => subscriber.error(err),
          complete: () => subscriber.complete()
        });

        return () => subscription.unsubscribe();
      });
    };
    return acc;
  }, {} as { [key: string]: (rawInput: FunctionParameters) => Observable<string> });
  const allStaticDependenciesNames = Object.keys(allStaticDependencies);

  const staticDependencies = functionOptions.map(({ name }) => name).reduce((acc, name) => {
    acc[name] = allStaticDependencies[name];
    return acc;
  }, {} as { [key: string]: (rawInput: FunctionParameters) => Observable<string> });

  const builtFunctionString = await buildFunction(functionHash, allStaticDependenciesNames);
  //console.log("builtFunctionString", builtFunctionString);

  const builtFunction = eval(builtFunctionString);

  const results: Observable<string> = builtFunction({ RxJS, staticDependencies, allStaticDependencies })(input);

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

  return [];
});
