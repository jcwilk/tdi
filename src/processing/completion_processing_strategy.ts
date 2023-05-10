import { ProcessingStrategy } from "./processing_strategy"
import { KeyValuePairs } from "../step"
import { getCompletion } from "../openai_api";
import { StrategySpec } from "../scenarios";

export class CompletionProcessingStrategy extends ProcessingStrategy {
  async process(key: string, spec: StrategySpec, dependentData: KeyValuePairs, temperature: number, callback: (output: string) => void): Promise<void> {
    if (typeof(spec) !== 'string') return

    const prompt = this.interpolatePrompt(spec, dependentData);
    await getCompletion(prompt, temperature, callback);
  }
}
