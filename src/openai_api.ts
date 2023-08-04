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
  functions?: FunctionOption[]
}

export type FunctionCall = {
  name: string,
  arguments: {
    [key: string]: any,
  }
}

export async function getChatCompletion(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  functions: FunctionOption[],
  onChunk: (chunk: string) => void,
  onFunctionCall: (functionCall: FunctionCall) => void = () => {},
): Promise<void> {
  const OPENAI_KEY = APIKeyFetcher();
  if (!OPENAI_KEY) return;

  try {
    const payload: ChatCompletionPayload = {
      messages,
      model,
      max_tokens: 2000,
      temperature,
      stream: true
    }
    if (functions.length > 0) {
      payload.functions = functions;
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

    let fullText = ''

    async function read() {
      const { value, done } = await reader.read();

      if (done) return onChunk(fullText.trim())

      const delta = extractChatValue(decoder.decode(value), onFunctionCall)

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

function extractChatValue(text: string, onFunctionCall: (functionCall: FunctionCall) => void): string {
  console.log(text)
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
        const deltaContent = choices[0]?.delta?.content || "";
        extractedValues += deltaContent;

        const functionCall = choices[0]?.delta?.function_call;
        if (functionCall) {
          const functionCallParsed = {
            name: functionCall.name,
            arguments: functionCall.arguments ? JSON.parse(functionCall.arguments) : {}
          };
          console.log("function called!!!", functionCallParsed)
          onFunctionCall(functionCallParsed);
        }
      }
    } catch (error) {
      console.error("Error parsing JSON:", error);
    }
  });

  return extractedValues;
}

const PAUSE_TIME_GRACE_PERIOD = 2; // in seconds

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

