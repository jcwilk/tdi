import { getCompletion } from './openai_api';
import { TDIStep, generateEmptyStepSpec, TDITestSteps as TDITestSteps } from "./scenarios"
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// can't for the life of me figure out how to get TS to STFU about
// the following import. works great and I've lost too much time to
// it, so something to figure out later (or never)
// @ts-ignore
import TesterWorker from "./tester.worker";

type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

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
    return this.spec;
  }

  public setSpec(spec: TDIStep, dependentData: KeyValuePairs): void {
    this.spec = spec;
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

  private interpolatePrompt(prompt: string, mergedData: KeyValuePairs): string {
    // do all replacements in one pass so we aren't interpolating into interpolated values
    return prompt.replace(/\/(\w+)/g, (matched, key) => {
      return mergedData.hasOwnProperty(key) ? mergedData[key] : matched;
    })
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

    const inputResults = Object.keys(this.spec.input).forEach((key) => {
      if (this.spec.input[key].length > 0 || !mergedData[key]) {
        this.emit('update', { [key]: this.interpolatePrompt(this.spec.input[key], mergedData) })
      }
    })

    const prompts = this.getCompletionPrompts();

    const promises = [];
    for (const key in prompts) {
        const prompt = this.interpolatePrompt(prompts[key], mergedData);
        promises.push(getCompletion(prompt, this.temperature, text => {
            this.emit('update', {[key]: text})
        }));
    }
    await Promise.all(promises);

    const tests = this.getTestData();
    const testResults: KeyValuePairs = {}

    for (const key in tests) {
      const { test, code } = tests[key];
      // TODO: draw from completionResults as well..?
      const testData = mergedData[test];
      const codeData = mergedData[code];
      let output = "";
      const testResult = await this.runJasmineTestsInWorker(codeData, testData, ({ passedCount, totalCount }) => {
        output = `Passing tests: ${passedCount} / ${totalCount}`;
      });

      if (testResult) output += "✅";

      testResults[key] = output;
      this.emit('update', { [key]: output })
    }

    return true;
  }

  public getTestData(): TDITestSteps {
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
      ...Object.keys(this.spec.test)
    ])]
  }

  private runJasmineTestsInWorker(functionString: string, jasmineTestsString: string, callback: TestResultsCallback): Promise<boolean> {
    return new Promise((resolve) => {
      const worker = new TesterWorker();

      worker.postMessage({
        functionString,
        jasmineTestsString,
      });

      worker.onmessage = function (event: MessageEvent) {
        const { passedCount, failedCount, totalCount } = event.data;
        callback({ passedCount, failedCount, totalCount });
        resolve(passedCount == totalCount);
      };
    });
  }
}
