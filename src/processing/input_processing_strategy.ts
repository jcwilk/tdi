import { ProcessingStrategy } from "./processing_strategy"
import { KeyValuePairs } from "../step"
import { StrategySpec } from "../scenarios";

export class InputProcessingStrategy extends ProcessingStrategy {
  async process(key: string, spec: StrategySpec, dependentData: KeyValuePairs, temperature: number, callback: (output: string) => void): Promise<void> {
    if (typeof(spec) !== 'string') return

    if (spec.length > 0 || !dependentData[key]) {
      callback(this.interpolatePrompt(spec, dependentData))
    }
  }
}
