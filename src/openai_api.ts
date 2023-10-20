import { Configuration, OpenAIApi } from 'openai';
import { APIKeyFetcher } from './api_key_storage';

const getClient = function(): OpenAIApi | null {
  const apiKey = APIKeyFetcher();
  if(!apiKey) return null;

  const configuration = new Configuration({ apiKey, organization: "org-6d0xAcuSuOUHzq8s4TejB1TQ" });
  return new OpenAIApi(configuration);
}

export type ChatMessage = {
  role: string,
  content: string
};

type JsonSchemaType = "string" | "number" | "object" | "array" | "boolean" | "null";

type JsonSchema = {
  type?: JsonSchemaType | JsonSchemaType[],
  items?: JsonSchema | JsonSchema[],
  properties?: {
    [key: string]: JsonSchema,
  },
  additionalProperties?: boolean | JsonSchema,
  required?: string[],
  enum?: any[],
  maximum?: number,
  minimum?: number,
  maxLength?: number,
  minLength?: number,
  pattern?: string,
  maxItems?: number,
  minItems?: number,
  allOf?: JsonSchema[],
  anyOf?: JsonSchema[],
  oneOf?: JsonSchema[],
  not?: JsonSchema,
  description?: string,
};

export type FunctionOption = {
  name: string,
  description?: string,
  parameters: {
    type: "object",
    properties: {
      [key: string]: JsonSchema,
    },
    required?: string[],
  },
};

export async function getCompletion(
  prompt: string,
  temperature: number,
  onChunk: (chunk: string) => void,
): Promise<void> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) return;

  try {
    const response = await fetch('https://api.openai.com/v1/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIKeyFetcher()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model: "text-davinci-003",
        max_tokens: 1900,
        temperature,
        stream: true
      })
    });
    if(!response.body) return

    const decoder = new TextDecoder('utf8');
    const reader = response.body.getReader();

    let fullText = ''

    async function read() {
      const { value, done } = await reader.read();

      if (done) return onChunk(fullText.trim())

      const delta = extractCompletionValue(decoder.decode(value))

      if (delta.length > 0) {
        fullText += delta
        onChunk(fullText.trim())
      }

      await read()

    }

    await read()

    return // fullText
  } catch (error) {
    return //error;
  }
}

function extractCompletionValue(text: string): string {
  const jsonEntries = text.split('\n').filter(entry => entry.startsWith('data: '));
  let extractedValues = '';

  jsonEntries.forEach(entry => {
    const jsonStringStartIndex = entry.indexOf('{');
    if (jsonStringStartIndex === -1) {
      return;
    }

    const jsonString = entry.slice(jsonStringStartIndex);
    try {
      const parsedJson = JSON.parse(jsonString);
      const choices = parsedJson?.choices;
      if (choices && Array.isArray(choices) && choices.length > 0) {
        extractedValues += choices[0]?.text;
      }
    } catch (error) {
      console.error("Error parsing JSON:", error);
    }
  });

  return extractedValues;
}

type ChatCompletionPayload = {
  messages: ChatMessage[],
  model: string,
  max_tokens: number,
  temperature: number,
  stream: boolean,
  functions?: FunctionOption[],
  function_call?: "none" | "auto"
}

type FunctionParameters = { [key: string]: any }

export type FunctionCall = {
  name: string,
  parameters: FunctionParameters
}

export async function getEmbedding(
  inputText: string,
  model: string = "text-embedding-ada-002"
): Promise<number[]> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  console.log("Getting embedding!", inputText, model)

  const payload = {
    input: inputText,
    model: model
  };

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch embedding: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function getChatCompletion(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  maxTokens: number,
  functions: FunctionOption[] = [],
  onChunk: (chunk: string) => void = () => {},
  onFunctionCall: (functionCall: FunctionCall) => void = () => {},
  onSentMessage: (message: string) => void = () => {},
  onCutoff: (message: string) => void = () => {}
): Promise<void> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) return;

  const payload: ChatCompletionPayload = {
    messages: messages.map((message: ChatMessage) => message.role === "function" ? { ...message, name: "TODO" } : message ),
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true
  }
  if (functions.length > 0) {
    payload.functions = functions;
    payload.function_call = "auto";
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APIKeyFetcher()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
  if(!response.body) return

  const decoder = new TextDecoder('utf8');
  const reader = response.body.getReader();

  let functionName: string | null = null;
  let aggregatedContents: string = '';
  let aggregatedRawContents: string = '';

  while(true) {
    const { value, done } = await reader.read();

    const rawDelta = decoder.decode(value)
    //console.log("raw delta:", rawDelta)

    aggregatedRawContents += rawDelta;
    const lines = splitDataLines(rawDelta)

    lines.forEach(line => {
      aggregatedContents = processChunk(
        line,
        aggregatedContents,
        functionName,
        name => functionName = name,
        onFunctionCall,
        onSentMessage,
        onCutoff
      )

      if (aggregatedContents !== "") {
        // Just so that we're sending a last hypothetical chunk out prior to calling onFunctionCall
        if (functionName) {
          onChunk(`Function call: ${functionName}\n\nArguments: ` + aggregatedContents)
        }
        else {
          onChunk(aggregatedContents)
        }
      }
    })

    if (done) {
      // console.log("full aggregate:", aggregatedContents)
      // console.log("full raw contents", aggregatedRawContents)

      return;
    }
  }
}

function splitDataLines(input: string): string[] {
  // Split by the double newline
  const rawLines = input.split('\n\n');

  // Trim and filter out only lines starting with 'data: '
  return rawLines.map(line => line.trim()).filter(line => line.startsWith('data: '));
}

// Designed to be called iteratively with `data` being one line starting with "data: ". The `data` chunks can form either (extra newline between items omitted for brevity, there are always two newlines between chunks):
// Regular messages, which are passed to the onMessage callback, in this case as message="Hi"
//
// data: {"id":"chatcmpl-7vUN8047stwUYXPRiOgiRHpnk4Awi","object":"chat.completion.chunk","created":1693935802,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vUN8047stwUYXPRiOgiRHpnk4Awi","object":"chat.completion.chunk","created":1693935802,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vUN8047stwUYXPRiOgiRHpnk4Awi","object":"chat.completion.chunk","created":1693935802,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vUN8047stwUYXPRiOgiRHpnk4Awi","object":"chat.completion.chunk","created":1693935802,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
// data: [DONE]
//
// Or function calls, which are passed to the onFunction callback, in this case as name="get_user_name" and parameters={"user_id": "123"}
//
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"role":"assistant","content":null,"function_call":{"name":"get_user_name","arguments":""}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":"{\n"}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":" "}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":" \""}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":"user_"}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":"id\":"}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":" "}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":"123"}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{"function_call":{"arguments":"}"}},"finish_reason":null}]}
// data: {"id":"chatcmpl-7vV0dlD4qvYJVjWm5t5JqgGlJZZt9","object":"chat.completion.chunk","created":1693938251,"model":"gpt-3.5-turbo-0613","choices":[{"index":0,"delta":{},"finish_reason":"function_call"}]}
// data: [DONE]
//
// It will call `onFunctionName` if it finds a function name, with the expectation that the `functionName` will be passed in to subsequent calls.
function processChunk(
  data: string,
  aggregatedContents: string,
  functionName: string | null,
  onFunctionName: (name: string) => void,
  onFunction: (functionCall: FunctionCall) => void, // found a function call
  onSendMessage: (message: string) => void, // found a complete sent message event
  onCutoff: (message: string) => void // found a sent message event which was finished because it ran out of tokens
): string {
  // Check for the DONE signal
  if (data.trim() === "data: [DONE]") {
    return aggregatedContents;  // We will handle the done signal in individual finish_reason checks now
  }

  // Extract the JSON object from the chunk
  const jsonData = JSON.parse(data.substring(6).trim()); // Removing "data: "

  // Check for function call name
  if (jsonData.choices[0].delta.function_call && jsonData.choices[0].delta.function_call.name) {
    const name = jsonData.choices[0].delta.function_call.name;
    onFunctionName(name);
    return jsonData.choices[0].delta.function_call.arguments || "";  // Start collecting function parameters
  }

  // If the chunk contains function call arguments, aggregate them
  if (jsonData.choices[0].delta.function_call && jsonData.choices[0].delta.function_call.arguments !== undefined) {
    return aggregatedContents + jsonData.choices[0].delta.function_call.arguments;
  }

  // If it's a regular message, aggregate the contents
  if (jsonData.choices[0].delta.content !== undefined) {
    return aggregatedContents + jsonData.choices[0].delta.content;
  }

  // Check the finish_reason to decide the action
  const finishReason = jsonData.choices[0].finish_reason;
  if (finishReason === 'stop') {
    onSendMessage(aggregatedContents);
    return ""; // Reset aggregated contents after sending the message
  } else if (finishReason === 'function_call') {
    onFunction({
      name: functionName!,
      parameters: JSON.parse(aggregatedContents) as FunctionParameters
    });
    return ""; // Reset aggregated contents after function call
  } else if (finishReason === 'length') {
    onCutoff(aggregatedContents);
    return ""; // Reset aggregated contents after calling the onCutoff callback
  }

  console.log("Unknown chunk type:", jsonData)
  return aggregatedContents;  // If no other conditions met, just return the previous aggregated contents
}

async function saveAudioInput(): Promise<{ audioBlobPromise: Promise<Blob>, stopRecording: () => void }> {
  console.log("Please say something...");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const audioChunks: Blob[] = [];

  mediaRecorder.addEventListener("dataavailable", (event) => {
    audioChunks.push(event.data);
  });

  const audioBlobPromise = new Promise<Blob>((resolve) => {
    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      resolve(audioBlob);
    });
  });

  const stopRecording = () => {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  mediaRecorder.start();

  return { audioBlobPromise, stopRecording };
}

class CustomFormData extends FormData {
  getHeaders() {
    return {
      'Content-Type': 'multipart/form-data',
    };
  }
}

export async function getTranscription(): Promise<{ getTranscript: () => Promise<string> }> {
  const openai = getClient();
  if (!openai) return { getTranscript: async () => ""};

  const { audioBlobPromise, stopRecording } = await saveAudioInput();

  // Override the FormData class used by the createTranscription function
  // @ts-ignore
  const originalFormDataCtor = openai.configuration.formDataCtor;
  // @ts-ignore
  openai.configuration.formDataCtor = CustomFormData;

  async function getTranscript(): Promise<string> {
    try {
      stopRecording();
      const audioBlob = await audioBlobPromise;
      const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });
      // @ts-ignore
      const transcription = await openai.createTranscription(audioFile, "whisper-1");
      const transcript = transcription.data.text;
      console.log("Transcript:", transcript);
      return transcript;
    } catch (error) {
      console.error("Error during transcription:", error);
      throw error;
    } finally {
      // Restore the original FormData class after the transcription is complete
      // @ts-ignore
      openai.configuration.formDataCtor = originalFormDataCtor;
    }
  }

  return { getTranscript };
}

export async function getEdit(sourceText: string): Promise<{ finishEdit: () => Promise<string | null> }> {
  const openai = getClient();
  if (!openai) return { finishEdit: async () => ""};

  const { getTranscript } = await getTranscription();

  const finishEdit = async () => {
    const transcript = await getTranscript();
    if(!transcript) return null;

    const response = await openai.createEdit({
      model: "text-davinci-edit-001",
      input: sourceText,
      instruction: transcript
    });
    return response.data.choices[0].text || "";
  }

  return { finishEdit };
}

export type TrainingLineItem = {
  prompt: string;
  completion: string;
};

export type FileRecord = {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
};

export async function uploadFile(
  data: TrainingLineItem[],
  filename: string
): Promise<FileRecord> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  const jsonl = data.map(item => JSON.stringify(item)).join('\n');
  const file = new Blob([jsonl], { type: "application/json" });
  const formData = new FormData();

  formData.append("purpose", "fine-tune");
  formData.append("file", file, filename);

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  const responseData: FileRecord = await response.json();
  return responseData;
}

export async function fetchFiles(): Promise<FileRecord[]> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch files: ${error}`);
  }

  const responseData = await response.json();
  return responseData.data.map((file: any): FileRecord => ({
    id: file.id,
    object: file.object,
    bytes: file.bytes,
    created_at: file.created_at,
    filename: file.filename,
    purpose: file.purpose,
    status: file.status,
  }));
}

export async function fetchFileContent(data: FileRecord): Promise<TrainingLineItem[]> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  const url = `https://api.openai.com/v1/files/${data.id}/content`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch file content: ${error}`);
  }

  const text = await response.text();
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);  // Split by newline and filter out empty lines
  return lines.map(line => JSON.parse(line) as TrainingLineItem);  // Parse each line as JSON and cast to TrainingLineItem
}

type DeleteFileResponse = {
  id: string;
  object: string;
  deleted: boolean;
};

export async function deleteFile(file: FileRecord): Promise<DeleteFileResponse> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  const response = await fetch(`https://api.openai.com/v1/files/${file.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete file: ${error}`);
  }

  const responseData: DeleteFileResponse = await response.json();
  return responseData;
}
