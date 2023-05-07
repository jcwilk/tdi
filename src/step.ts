import { getCompletion } from './openai_api';
import { TDIStep, generateEmptyStepSpec } from "./scenarios"
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

type KeyValuePairs = {[key: string]: string}

export type StepSaveData = {
  outputData: {[key: string]: string},
  temperature: number,
  spec: TDIStep[]
}

const emptyStringValues = (obj: KeyValuePairs) => {
  const result: KeyValuePairs = {};
  for (let key in obj) {
    result[key] = '';
  }
  return result;
};

export class Step extends EventEmitter {
  private spec: any;
  private inputData: { [key: string]: any };
  private completionResults: { [key: string]: any };
  private testResults: { [key: string]: any };
  private temperature: number;
  public uuid: string;

  constructor() {
    super();

    this.uuid = uuidv4();
    this.spec = generateEmptyStepSpec();
    this.inputData = emptyStringValues(this.spec.input);
    this.completionResults = {};
    this.testResults = {};
    this.temperature = 1;
  }

  public subscribe(callback: () => void): void {
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

  public setSpec(spec: TDIStep): void {
    this.spec = spec;
    this.clearOutputData();

    for (let property in this.spec.input) {
      this.inputData[property] = this.spec.input[property];
    }

    this.emit('update');
  }

  public clearOutputData(): void {
    this.inputData = {};
    this.testResults = {};
    this.completionResults = {};
    this.emit('update');
  }

  public getDescription(): string {
    return this.spec.description;
  }

  public getDepends(): string[] {
    return this.spec.depends || [];
  }

  public getSaveData(): StepSaveData {
    return {
      outputData: this.getOutputData(),
      temperature: this.temperature,
      spec: this.spec
    };
  }

  public setSaveData(data: StepSaveData): void {
    this.spec = data.spec
    for (const key in data.outputData) {
      const value = data.outputData[key];
      this.setOutputData(key, value);
    }
    this.temperature = data.temperature;
    this.emit('update');
  }

  public getInputFields(): { [key: string]: string } {
    return this.spec.input;
  }

  public getCompletionPrompts(): {[key: string]: string} {
    return this.spec.completion ? {...this.spec.completion} : {};
  }

  public getCompletionData(): string[] {
    const completionKeys = Object.keys(this.spec.completion);
    return completionKeys.map((key) => this.completionResults[key]);
  }

  public setOutputData(key: string, value: string): void {
    if (this.spec.input && this.spec.input.hasOwnProperty(key)) {
      this.inputData[key] = value;
    }
    else if (this.spec.test && this.spec.test.hasOwnProperty(key)) {
      this.testResults[key] = value;
    }
    else if (this.spec.completion && this.spec.completion.hasOwnProperty(key)) {
      this.completionResults[key] = value;
    }
    this.emit('update');
  }

  private mergeInputAndCompletionResults(): { [key: string]: any } {
    return { ...this.inputData, ...this.completionResults, ...this.testResults };
  }

  public getTemperature(): number {
    return this.temperature;
  }

  public setTemperature(temperature: number): void {
    this.temperature = temperature
    this.emit('update');
  }

  public getOutputData(): { [key: string]: any } {
    return this.mergeInputAndCompletionResults();
  }

  private interpolatePrompt(prompt: string, mergedData: { [key: string]: any }): string {
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
      if((this.spec[k] || {}).hasOwnProperty(key)) {
        return k
      }
    }
    return "unknown"
  }

  public async runCompletion(dependentData: { [key: string]: string }): Promise<boolean> {
    this.completionResults = {}
    this.testResults = {}
    this.emit('update');

    if (!this.areDependentsSatisfied(dependentData)) {
      return false;
    }

    const mergedData = { ...this.inputData, ...dependentData };
    const prompts = this.getCompletionPrompts();

    for (const key in prompts) {
      const prompt = this.interpolatePrompt(prompts[key], mergedData);

      const output = await getCompletion(prompt, this.temperature);
      this.completionResults[key] = output;
      this.emit('update');
    }

    const finalData = { ...mergedData, ...this.completionResults };
    const tests = this.getTestData();

    for (const key in tests) {
      const {test, code} = tests[key];
      const testData = finalData[test];
      const codeData = finalData[code];
      let output = "";
      const testResult = await this.runJasmineTestsInWorker(codeData, testData, ({ passedCount, totalCount }) => {
        output = `Passing tests: ${passedCount} / ${totalCount}`;
      });

      if(testResult) output += "✅"

      this.testResults[key] = output;
      this.emit('update');
    }

    return true;
  }

  public getTestData() {
    return this.spec.test ? {...this.spec.test} : {};
  }

  public isStepCompleted(): boolean {
    for (let property in this.spec.completion) {
      if (!this.completionResults[property]) {
        return false
      }
    }

    for (let property in this.spec.test) {
      if (!this.testResults[property]) {
        return false
      }
    }

    for (let property in this.spec.input) {
      if (!this.inputData[property]) {
        return false
      }
    }

    return true
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
