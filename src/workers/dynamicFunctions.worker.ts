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

  return `
    (utils) => (input) => {
      const { RxJS } = utils;
      utils = { RxJS, allStaticDependencies: utils.allStaticDependencies };

      const dependencies = {...utils.allStaticDependencies, ...${dynamicDependencyMapping}};
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

// TODO...
function customJsonpRunner(_utils: any, url: any, ..._extra_params: any[]) {
  if(typeof url !== "string") throw new Error("URL must be a string");

  return new Promise<string>((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    // @ts-ignore
    self[callbackName] = function(data: {data: {[key: string]: any}}) {
      // @ts-ignore
      delete self[callbackName];
      const stringifiedData = JSON.stringify(data.data);
      resolve(stringifiedData);
    };

    const script = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
    importScripts(script);
  });
}

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
  const { functionHash, input } = data;

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

        // Unfortunate hack necessary because the JSONP works slightly differently from a worker than it does from
        // the main thread. Maybe there's a way to unify them, but something to come back to as time permits.
        const overriddenFunction = functionSpec.name === "jsonp_data_retrevial" ? customJsonpRunner : functionSpec.implementation;

        const result = coerceInputOrReturn(overriddenFunction({ db }, ...inputArray));

        console.log("result", result)

        const subscription = result.subscribe({
          next: value => {
            console.log("value", typeof value, value)
            subscriber.next(value)
          },
          error: err => subscriber.error(err),
          complete: () => subscriber.complete()
        });

        return () => subscription.unsubscribe();
      });
    };
    return acc;
  }, {} as { [key: string]: (rawInput: FunctionParameters) => Observable<string> });
  const allStaticDependenciesNames = Object.keys(allStaticDependencies);

  const builtFunctionString = await buildFunction(functionHash, allStaticDependenciesNames);
  //console.log("builtFunctionString", builtFunctionString);

  const builtFunction = eval(builtFunctionString);

  const results: Observable<string> = builtFunction({ RxJS, allStaticDependencies })(input);

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
