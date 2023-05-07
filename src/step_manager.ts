import { Step, StepSaveData, KeyValuePairs } from './step';
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

  public setOutputData(key: string, value: string): void {
    this.dependentData[key] = value
    this.emit('update')
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

  public getSaveData(): { stepData: StepSaveData[], name: string, outputData: KeyValuePairs } {
    return {
      stepData: this.steps.map((step) => step.getSaveData()),
      name: this.name,
      outputData: this.dependentData,
    };
  }

  public addStep(): Step {
    const step = new Step();
    this.steps.push(step);

    step.subscribe(data => {
      // Merge data from the step's update event into dependentData
      this.dependentData = { ...this.dependentData, ...data };

      if (!this.getName() && this.dependentData.name) this.setName(this.dependentData.name);

      this.emit('update');
    });

    this.emit('update');
    return step;
  }

  public getDependentData(): { [key: string]: string } {
    return this.dependentData;
  }

  public setSaveData(data: { stepData: StepSaveData[], name: string, outputData: KeyValuePairs }): void {
    this.steps.forEach(step => step.destroy());
    this.steps = [];

    for (let i = 0; i < data.stepData.length; i++) {
      const step = this.addStep();
      step.setSaveData(data.stepData[i]);
    }

    this.dependentData = {...data.outputData}

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
    return this.steps.every((step) => step.isStepCompleted(this.dependentData));
  }
}
