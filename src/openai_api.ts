import { Configuration, OpenAIApi } from 'openai';
import { APIKeyFetcher } from './api_key_storage';

const getClient = function(): OpenAIApi | null {
  const apiKey = APIKeyFetcher();
  if(!apiKey) return null;

  const configuration = new Configuration({ apiKey, organization: "org-6d0xAcuSuOUHzq8s4TejB1TQ" });
  return new OpenAIApi(configuration);
}

export async function getCompletion(prompt: string, temperature: number): Promise<string> {
  const openai = getClient();
  if(!openai) return "";

  try {
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt,
      max_tokens: 2000,
      temperature
    });

    return completion.data.choices[0].text || "";
  } catch (error) {
    console.error('Error getting completion:', error);
    return "";
  }
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

