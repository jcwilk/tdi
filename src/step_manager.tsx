import { Step, StepSaveData } from './step';

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepManager {
  private steps: Step[];
  private autoRetryEnabled: boolean;
  private name: string;

  constructor(apiKey: string, stepSpecs: any[]) {
    this.steps = stepSpecs.map((spec) => new Step(spec, apiKey));
    this.autoRetryEnabled = false;
    this.name = '';
  }

  public setOnStepCompleted(callback: () => void): void {
    const wrappedCallback = () => {
      // Aggregate output data from all steps
      const aggregatedOutputData: { [key: string]: any } = {};
      for (const step of this.steps) {
        const outputData = step.getOutputData();
        for (const key in outputData) {
          aggregatedOutputData[key] = outputData[key];
        }
      }

      if (!this.getName() && aggregatedOutputData.name) this.setName(aggregatedOutputData.name);

      // Feed the aggregated data into each step as dependent data
      for (const step of this.steps) {
        step.setDependentData(aggregatedOutputData);
      }

      // Call the original callback
      callback();
    };

    for (const step of this.steps) {
      step.setOnStepCompleted(wrappedCallback);
    }
  }

  public getSteps(): Step[] {
    return this.steps;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setAutoRetryEnabled(enabled: boolean): void {
    this.autoRetryEnabled = enabled;
  }

  public isAutoRetryEnabled(): boolean {
    return this.autoRetryEnabled;
  }

  public getSaveData(): { stepData: StepSaveData[], name: string } {
    return {
      stepData: this.steps.map((step) => step.getSaveData()),
      name: this.name,
    };
  }

  public setSaveData(data: { stepData: StepSaveData[], name: string }): void {
    for (let i = 0; i < data.stepData.length; i++) {
      this.steps[i].setSaveData(data.stepData[i]);
    }

    this.setName(data.name);
  }

  public getSuccess(): boolean {
    return this.steps.every((step) => step.isStepCompleted());
  }
}
