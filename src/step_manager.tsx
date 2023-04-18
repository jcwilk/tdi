import { EventEmitter } from 'events';

export interface StepData {
  outputText: string;
  step: number;
}

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepManager extends EventEmitter {
  private stepData: StepData[];
  private autoRetryEnabled: boolean;
  private success: boolean;
  private name: string;

  constructor() {
    super();
    this.stepData = [{outputText: '', step: 0}];
    this.autoRetryEnabled = false;
    this.success = false;
    this.name = '';
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setAutoRetryEnabled(enabled: boolean): void {
    this.autoRetryEnabled = enabled;
    this.emit('stepDataChanged');
  }

  public isAutoRetryEnabled(): boolean {
    return this.autoRetryEnabled;
  }

  public addStep(outputText: string, step: number): void {
    this.stepData.push({outputText, step});
    this.emit('stepDataChanged');
  }

  public resetStepsAfter(stepIndex: number): void {
    this.stepData = this.stepData.filter((_, index) => index <= stepIndex);
    this.emit('stepDataChanged');
  }

  public getStepData(): StepData[] {
    return this.stepData;
  }

  public setStepData(stepData: StepData[]): void {
    this.stepData = stepData;
    this.emit('stepDataChanged');
  }

  getSaveData(): { stepData: StepData[], name: string } {
    return {
      stepData: this.stepData,
      name: this.name,
    };
  }

  loadFunctionData(functionData: any) {
    this.stepData.splice(0, this.stepData.length, ...functionData.stepData);
    this.success = true;
    this.name = functionData.name;
    this.emit('stepDataChanged');
  }

  public updateStepOutput(index: number, outputText: string): void {
    this.stepData[index].outputText = outputText;
    this.emit('stepDataChanged');
  }

  public getSuccess(): boolean {
    return this.success;
  }

  public setSuccess(success: boolean): void {
    this.success = success;
    if (success) this.autoRetryEnabled = false;
    this.emit('stepDataChanged');
  }
}
