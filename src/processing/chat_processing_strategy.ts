import { ProcessingStrategy } from "./processing_strategy"
import { KeyValuePairs } from "../step"
import { getChatCompletion } from "../openai_api";
import { StrategySpec } from "../scenarios";

export class ChatProcessingStrategy extends ProcessingStrategy {
  async process(key: string, spec: StrategySpec, dependentData: KeyValuePairs, temperature: number, callback: (output: string) => void): Promise<void> {
    if (!Array.isArray(spec)) return // TODO: less janky type guards sureba ino?

    const messages = spec.map((message) => {
      const newMessage = { ...message }
      newMessage.content = this.interpolatePrompt(message.content, dependentData);
      return newMessage
    })
    await getChatCompletion(messages, temperature, callback);
  }
}
