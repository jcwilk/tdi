import { Configuration, OpenAIApi } from "openai";
import { APIKeyFetcher } from "./api_key_storage";
import { getTranscription } from "./openai_api";

const PAUSE_TIME_GRACE_PERIOD = 2; // Adjust this value to change the grace period

async function saveAudioInput(): Promise<Blob> {
  console.log("Please say something...");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const audioChunks: Blob[] = [];

  mediaRecorder.addEventListener("dataavailable", (event) => {
    audioChunks.push(event.data);
  });

  return new Promise<Blob>((resolve) => {
    mediaRecorder.addEventListener("stop", () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      resolve(audioBlob);
    });

    mediaRecorder.start();

    setTimeout(() => {
      mediaRecorder.stop();
    }, PAUSE_TIME_GRACE_PERIOD * 1000);
  });
}

async function getAudioInput(): Promise<string> {
  const audioBlob = await saveAudioInput();
  const audioFile = new File([audioBlob], "audio.wav", { type: "audio/wav" });

  const apiKeyFetcher = new APIKeyFetcher();
  const apiKey = await apiKeyFetcher.fetchAPIKey();

  const configuration = new Configuration({
    apiKey,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const transcription = await openai.createTranscription(audioFile, "whisper-1");
    const transcript = transcription.data.text;
    console.log("Transcript:", transcript);
    return transcript;
  } catch (error) {
    console.error("Error during transcription:", error);
    throw error;
  }
}

export { getAudioInput };
