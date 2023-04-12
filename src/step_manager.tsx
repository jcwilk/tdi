import React from 'react';
import TesterWorker from "./tester.worker";

export interface StepData {
  outputText: string;
  step: number;
}

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepManager {
  private stepData: StepData[];

  constructor() {
    this.stepData = [];
  }

  public async addStep(completionText: string, nextStep: number): Promise<void> {
    if (nextStep === 3) {
      await this.runJasmineTestsInWorker(completionText, this.stepData[1].outputText, ({ passedCount, totalCount }) => {
        completionText += `\n\nPassing tests: ${passedCount} / ${totalCount}`;

        this.stepData.push({
          outputText: (completionText || "").trim(),
          step: nextStep
        });
      });
    } else {
      this.stepData.push({ outputText: (completionText || "").trim(), step: nextStep });
    }
  }

  public resetStepsAfter(stepIndex: number): void {
    this.stepData = this.stepData.filter((_, index) => index <= stepIndex);
  }

  public getStepData(): StepData[] {
    return this.stepData;
  }

  public updateStepOutput(index: number, outputText: string): void {
    this.stepData[index].outputText = outputText;
  }

  private runJasmineTestsInWorker(functionString: string, jasmineTestsString: string, callback: TestResultsCallback): Promise<void> {
    return new Promise((resolve) => {
      const worker = new TesterWorker();

      worker.postMessage({
        functionString,
        jasmineTestsString,
      });

      worker.onmessage = function (event: MessageEvent) {
        const { passedCount, failedCount, totalCount } = event.data;
        callback({ passedCount, failedCount, totalCount });
        resolve();
      };
    });
  }
}
