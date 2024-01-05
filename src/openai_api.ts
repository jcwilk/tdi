import { OpenAI } from 'openai';
import { APIKeyFetcher } from './api_key_storage';
import JSON5 from 'json5'
import { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ChatCompletionStreamParams } from 'openai/resources/beta/chat/completions';
import { v4 as uuidv4 } from 'uuid';

const getClient = function(): OpenAI | null {
  const apiKey = APIKeyFetcher();
  if(!apiKey) return null;

  return new OpenAI({ apiKey, organization: "org-6d0xAcuSuOUHzq8s4TejB1TQ", dangerouslyAllowBrowser: true });
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

export type ToolOption = {
  type: "function",
  function: FunctionOption
}

export type FunctionParameters = { [key: string]: any }

export type FunctionCallMetadata = LegacyFunctionCall | ToolFunctionCall

export type LegacyFunctionCall = {
  name: string,
  parameters: FunctionParameters,
  uuid: string,
}

export type ToolFunctionCall = {
  name: string,
  parameters: FunctionParameters,
  id: string,
  uuid: string, // TODO: it may make sense to merge this with id eventually
}

export function isToolFunctionCall(functionCall: FunctionCallMetadata): functionCall is ToolFunctionCall {
  return "id" in functionCall && typeof functionCall.id === "string";
}

export async function getEmbedding(
  inputText: string,
  model: string = "text-embedding-ada-002"
): Promise<number[]> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) throw new Error("API Key not found");

  //console.log("Getting embedding!", inputText, model)

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
  messages: ChatCompletionMessageParam[],
  temperature: number,
  model = "gpt-4",
  maxTokens: number,
  functions: FunctionOption[] = [],
  onChunk: (chunk: string) => void = () => {},
  onFunctionCall: (functionCall: FunctionCallMetadata) => void = () => {},
  onSentMessage: (message: string) => void = () => {},
  onCutoff: (message: string) => void = () => {}
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const payload: ChatCompletionStreamParams = {
    // TODO: Getting the function name here programmatically is a little bit tricky since we need the original contents of the message
    // which contains the name of the function call. The embellished contents of the message is (at time of writing) a human readable
    // markdown version of the message which would be too awkward to parse the name out of. There's some work to be done here to make
    // it less ambiguous about whether a message is a function call, whether it's been embellished, etc.
    messages,
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true
  }
  if (functions.length > 0) {
    payload.tools = functions.map(functionOption => ({ type: "function", function: functionOption }));
    payload.tool_choice = "auto";
  }

  const stream = client.beta.chat.completions.stream(payload);

  stream.on('content', (_chunk: string, snapshot: string) => {
    onChunk(snapshot);
  })

  stream.on('chatCompletion', (completion: ChatCompletion) => {
    const message = completion.choices[0].message;
    const finishReason = completion.choices[0].finish_reason;

    if (message.content && message.content.length > 0) {
      if (finishReason === "length") {
        onCutoff(message.content);
      }
      else {
        onSentMessage(message.content);
      }
    }

    if (message.function_call) onFunctionCall({name: message.function_call.name, parameters: JSON5.parse(message.function_call.arguments) as FunctionParameters, uuid: uuidv4()});

    if (message.tool_calls) {
      message.tool_calls.forEach(toolCall => {
        onFunctionCall({name: toolCall.function.name, parameters: JSON5.parse(toolCall.function.arguments) as FunctionParameters, id: toolCall.id, uuid: uuidv4()});
      })
    }
  });

  await stream.done();
}

async function saveAudioInput(): Promise<{ audioBlobPromise: Promise<Blob>, stopRecording: () => void }> {
  //console.log("Please say something...");

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

export async function fetchFiles(key?: string): Promise<FileRecord[]> {
  const OPENAI_KEY = key || APIKeyFetcher();
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

