import { Step, StepSaveData } from './step';
import { EventEmitter } from 'events';

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepManager extends EventEmitter {
  private steps: Step[];
  private autoRetryEnabled: boolean;
  private name: string;
  private dependentData: { [key: string]: string };

  constructor(stepSpecs: any[]) {
    super();
    this.steps = [];
    this.dependentData = {};
    for (let i = 0; i < stepSpecs.length; i++) {
      const step = this.addStep();
      step.setSpec(stepSpecs[i]);
    }
    this.autoRetryEnabled = false;
    this.name = '';
  }

  public subscribe(callback: () => void): void {
    this.on('update', callback);
  }

  public unsubscribe(callback: () => void): void {
    this.removeListener('update', callback);
  }

  public moveStep(dragId: string, dropId: string): void {
    const dragIndex = this.steps.findIndex((item) => item.uuid === dragId);
    const dropIndex = this.steps.findIndex((item) => item.uuid === dropId);

    if (dragIndex < 0 || dropIndex < 0) {
      console.error(`Invalid indices: dragIndex=${dragIndex}, dropIndex=${dropIndex}. Cannot move step.`);
      return;
    }

    const [draggedStep] = this.steps.splice(dragIndex, 1);
    this.steps.splice(dropIndex, 0, draggedStep);
    this.emit('update');
  }

  public getSteps(): Step[] {
    return [...this.steps];
  }

  public setName(name: string): void {
    this.name = name;
    this.emit('update');
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
    const step = new Step();
    this.steps.push(step);

    step.subscribe(() => {
      // Aggregate output data from all steps
      const aggregatedOutputData: { [key: string]: string } = {};
      for (const step of this.steps) {
        const outputData = step.getOutputData();
        for (const key in outputData) {
          aggregatedOutputData[key] = outputData[key];
        }
      }

      if (!this.getName() && aggregatedOutputData.name) this.setName(aggregatedOutputData.name);

      // Store the aggregated data so we can feed it into each step later
      this.dependentData = aggregatedOutputData;

      this.emit('update');
    });

    this.emit('update');
    return step;
  }

  public getDependentData(): { [key: string]: string } {
    return this.dependentData;
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
      this.emit('update');
    } else {
      console.error(`Invalid index: ${index}. Cannot delete step.`);
    }
  }

  public getSuccess(): boolean {
    return this.steps.every((step) => step.isStepCompleted());
  }
}
