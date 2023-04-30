import { getCompletion } from './openai_api';
import TesterWorker from "./tester.worker";

type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export type StepSaveData = {
  dependentData: {[key: string]: string},
  outputData: {[key: string]: string},
  temperature: number
}

const emptyStringValues = (obj: { [key: string]: string }) => {
  const result = {};
  for (let key in obj) {
    result[key] = '';
  }
  return result;
};

export class Step {
  private spec: any;
  private inputData: { [key: string]: any };
  private dependentData: { [key: string]: any };
  private completionResults: { [key: string]: any };
  private testResults: { [key: string]: any };
  private temperature: number;
  private onStepCompleted: (() => void) | null = null;

  constructor(spec: any) {
    this.spec = spec;
    this.inputData = emptyStringValues(spec.input);
    this.dependentData = {};
    this.completionResults = {};
    this.testResults = {};
    this.temperature = 1;
  }

  public setOnStepCompleted(callback: () => void): void {
    this.onStepCompleted = callback;
  }

  public getDescription(): string {
    return this.spec.description;
  }

  public getDepends(): string[] {
    return this.spec.depends || [];
  }

  public getSaveData(): StepSaveData {
    return {
      dependentData: { ...this.dependentData },
      outputData: this.getOutputData(),
      temperature: this.temperature,
    };
  }

  public setSaveData(data: StepSaveData): void {
    this.dependentData = { ...data.dependentData };
    for (const key in data.outputData) {
      const value = data.outputData[key];
      this.setOutputData(key, value);
    }
    this.temperature = data.temperature;
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
  }

  public setDependentData(dependentData: { [key: string]: any }): void {
    this.dependentData = {};
    for (const key in dependentData) {
      if ((this.spec.depends || []).includes(key)) {
        this.dependentData[key] = dependentData[key];
      }
    }
  }

  private mergeInputAndCompletionResults(): { [key: string]: any } {
    return { ...this.inputData, ...this.completionResults, ...this.testResults };
  }

  public getTemperature(): number {
    return this.temperature;
  }

  public setTemperature(temperature: number): void {
    this.temperature = temperature
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

  public async runCompletion(): Promise<boolean> {
    this.completionResults = {}
    this.testResults = {}

    if (this.onStepCompleted) {
      this.onStepCompleted();
    }

    if (!this.areDependentsSatisfied()) {
      return false;
    }

    const mergedData = { ...this.inputData, ...this.dependentData };
    const prompts = this.getCompletionPrompts();

    for (const key in prompts) {
      const prompt = this.interpolatePrompt(prompts[key], mergedData);

      const output = await getCompletion(prompt, this.temperature);
      this.completionResults[key] = output;
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
    }

    if (this.onStepCompleted) {
      this.onStepCompleted();
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

  public areDependentsSatisfied(): boolean {
    const depends = this.getDepends();

    for (let i = 0; i < depends.length; i++) {
      const depend = depends[i];
      if (!this.dependentData.hasOwnProperty(depend) || this.dependentData[depend] === "") {
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
