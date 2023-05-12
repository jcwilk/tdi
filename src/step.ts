import { getCompletion } from './openai_api';
import { TDIStep, generateEmptyStepSpec, TDITestStep } from "./scenarios"
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { StrategyFactory, StrategyType, strategyTypes } from './processing/strategy_factory';



export type KeyValuePairs = {[key: string]: string}

export type StepSaveData = {
  temperature: number,
  spec: TDIStep
}

const emptyStringValues = (obj: KeyValuePairs, defaults?: KeyValuePairs) => {
  const result: KeyValuePairs = {};
  for (let key in obj) {
    if (defaults && defaults.hasOwnProperty(key) && defaults[key].length > 0) {
      result[key] = defaults[key];
    }
    else {
      result[key] = obj[key];
    }
  }
  return result;
};

export class Step extends EventEmitter {
  private spec: TDIStep;
  private temperature: number;
  public uuid: string;

  constructor() {
    super();

    this.uuid = uuidv4();
    this.spec = generateEmptyStepSpec();
    this.temperature = 0.5;
  }

  public subscribe(callback: (updates: KeyValuePairs) => void): void {
    this.on('update', callback);
  }

  public unsubscribe(callback: () => void): void {
    this.removeListener('update', callback);
  }

  public hasCompletions(): boolean {
    return Object.values(this.spec.completion || {}).some(value => !!value && value.length > 0)
  }

  public destroy(): void {
    this.removeAllListeners();
    // Perform any other necessary cleanup actions
  }

  public getSpec(): TDIStep {
    const spec = JSON.parse(JSON.stringify(this.spec));
    for (const key in spec) {
      if (this.isEmptyOrBlankObject(spec[key])) delete(spec[key])
    }
    return spec
  }

  private isEmptyOrBlankObject(obj: any) {
    if(obj === undefined || obj === null) return true

    // if it's a string or array or something just leave it
    if(typeof(obj) !== "object") return false

    for(var key in obj) {
      if(obj.hasOwnProperty(key))
        return false;
    }
    return true;
  }

  public setSpec(spec: TDIStep, dependentData: KeyValuePairs): void {
    this.spec = JSON.parse(JSON.stringify(spec));

    for (const strategyType of strategyTypes) {
      if (!this.spec.hasOwnProperty(strategyType) || !this.spec[strategyType]) {
        this.spec[strategyType] = {}
      }
    }

    this.emit('update', emptyStringValues(spec.input, dependentData));
  }

  public getDescription(): string {
    return this.spec.description;
  }

  public getDepends(): string[] {
    return this.spec.depends || [];
  }

  public getSaveData(): StepSaveData {
    return {
      temperature: this.temperature,
      spec: this.spec
    };
  }

  public setSaveData(data: StepSaveData): void {
    this.setSpec(data.spec, {})
    this.temperature = data.temperature;
  }

  public getInputFields(): KeyValuePairs {
    return this.spec.input;
  }

  public getCompletionPrompts(): KeyValuePairs {
    return this.spec.completion ? {...this.spec.completion} : {};
  }

  public getTemperature(): number {
    return this.temperature;
  }

  public setTemperature(temperature: number): void {
    this.temperature = temperature;
    this.emit('update');
  }

  public getKeyType(key: string): string {
    let keys = ["input", "completion", "test"]
    for(let k of keys) {
      if (((this.spec as Record<string, any>)[k] || {}).hasOwnProperty(key)) {
        return k;
      }
    }
    return "unknown"
  }

  public async runCompletion(dependentData: { [key: string]: string }): Promise<boolean> {
    if (!this.areDependentsSatisfied(dependentData)) {
      return false;
    }

    const mergedData = { ...emptyStringValues(this.spec.input), ...dependentData };

    const processStrategyType = async (strategyType: StrategyType) => {
      const strategy = StrategyFactory.createStrategy(strategyType);
      const keyValuePairs = this.spec[strategyType];

      const promises = [];
      for (const outputKey in keyValuePairs) {
        const promise = strategy.process(
          outputKey,
          keyValuePairs[outputKey],
          mergedData,
          this.temperature,
          (output: string) => {
            this.emit('update', { [outputKey]: output });
          }
        );
        promises.push(promise);
      }

      await Promise.all(promises);
    };

    for (const strategyType of strategyTypes) {
      if (this.spec.hasOwnProperty(strategyType)) {
        await processStrategyType(strategyType);
      }
    }

    return true;
  }

  public getTestData(): { [key: string]: TDITestStep } {
    return this.spec.test ? { ...this.spec.test } : {};
  }

  public areDependentsSatisfied(dependentData: { [key: string]: string }): boolean {
    const depends = this.getDepends();

    for (let i = 0; i < depends.length; i++) {
      const depend = depends[i];
      if (!dependentData.hasOwnProperty(depend) || dependentData[depend] === "") {
        return false;
      }
    }
    return true;
  }

  public isStepCompleted(data: KeyValuePairs): boolean {
    const keys = this.getOutputKeys();

    for(let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!data[key]) return false
    }

    return true
  }

  public getOutputKeys(): string[] {
    return [...new Set([
      ...Object.keys(this.spec.input),
      ...Object.keys(this.spec.completion),
      ...Object.keys(this.spec.test),
      ...Object.keys(this.spec.chat)
    ])]
  }
}
