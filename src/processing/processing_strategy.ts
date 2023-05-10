import { KeyValuePairs } from "../step";
import { StrategySpec } from "../scenarios";

export abstract class ProcessingStrategy {
  abstract process(key: string, spec: StrategySpec, dependentData: KeyValuePairs, temperature: number, callback: (output: string) => void): Promise<void>;

  interpolatePrompt(prompt: string, mergedData: KeyValuePairs): string {
    // do all replacements in one pass so we aren't interpolating into interpolated values
    return prompt.replace(/\/(\w+)/g, (matched, key) => {
      return mergedData.hasOwnProperty(key) ? mergedData[key] : matched;
    })
  }
}
