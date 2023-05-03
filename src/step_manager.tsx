import { Step, StepSaveData } from './step';
import EventEmitter from 'events';

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepManager extends EventEmitter {
  private steps: Step[];
  private autoRetryEnabled: boolean;
  private name: string;

  constructor(stepSpecs: any[]) {
    super();
    this.steps = stepSpecs.map((spec) => new Step(spec));
    this.autoRetryEnabled = false;
    this.name = '';
  }

  public subscribe(callback: () => void): void {
    this.on('updateStepsSet', callback);
  }

  public unsubscribe(callback: () => void): void {
    this.removeListener('updateStepsSet', callback);
  }

  public getSteps(): Step[] {
    return [...this.steps];
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

  public addStep(): Step {
    const step = new Step([]);
    this.steps.push(step);

    step.subscribe(() => {
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
    });

    this.emit('updateStepsSet');
    return step;
  }

  public setSaveData(data: { stepData: StepSaveData[], name: string }): void {
    this.steps.forEach(step => step.destroy());
    this.steps = [];

    for (let i = 0; i < data.stepData.length; i++) {
      const step = this.addStep();
      step.setSaveData(data.stepData[i]);
    }

    this.setName(data.name);
  }

  public deleteAt(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].destroy();
      this.steps.splice(index, 1);
      this.emit('updateStepsSet');
    } else {
      console.error(`Invalid index: ${index}. Cannot delete step.`);
    }
  }

  public getSuccess(): boolean {
    return this.steps.every((step) => step.isStepCompleted());
  }
}
