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
    this.temperature = 1;
  }

  public subscribe(callback: (updates: KeyValuePairs) => void): void {
    this.on('update', callback);
  }

  public unsubscribe(callback: () => void): void {
    this.removeListener('update', callback);
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
    let result = prompt;
    for (const key in mergedData) {
      const value = mergedData[key];
      result = result.replace(new RegExp(`\\/${key}`, "g"), value);
    }
    return result;
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

    // only take the key-values which correspond to keys in the input spec
    const inputResults = Object.keys(this.spec.input).reduce((acc: KeyValuePairs, key) => {
      // interpolate merged data into the value so we can use it to pipe and transform between values
      if (mergedData.hasOwnProperty(key)) acc[key] = this.interpolatePrompt(mergedData[key], mergedData)
      return acc
    }, {})

    const prompts = this.getCompletionPrompts();
    const completionResults: KeyValuePairs = {}

    for (const key in prompts) {
      const prompt = this.interpolatePrompt(prompts[key], mergedData);

      const output = await getCompletion(prompt, this.temperature);
      completionResults[key] = output;
    }

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
    }

    this.emit('update', { ...inputResults, ...completionResults, ...testResults })

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
    const keys = [...new Set([
      ...Object.keys(this.spec.input),
      ...Object.keys(this.spec.completion),
      ...Object.keys(this.spec.test)
    ])];

    for(let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!data[key]) return false
    }

    return true
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
