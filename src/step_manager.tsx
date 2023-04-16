import React from 'react';
import { getMainStepPrompt } from './prompt_factory';
import { getCompletion } from './openai_api';
import TesterWorker from "./tester.worker";
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
  private currentStep: number;
  private stepData: StepData[];
  private currentRequestId: number;
  private autoRetryEnabled: boolean;
  private success: boolean;

  constructor() {
    super();
    this.currentStep = 0;
    this.stepData = [{outputText: '', step: 0}];
    this.currentRequestId = 0;
    this.autoRetryEnabled = false;
  }

  public setAutoRetryEnabled(enabled: boolean, apiKey: string, temperature: number): void {
    this.autoRetryEnabled = enabled;
    this.emit('stepDataChanged');
    if (enabled) {
      this.handleStep(2, apiKey, temperature);
    }
  }

  public isAutoRetryEnabled(): boolean {
    return this.autoRetryEnabled;
  }

  public async handleStep(
    step: number,
    apiKey: string | null,
    temperature: number
  ): Promise<void> {
    if (!apiKey) {
      throw new Error('API Key is not set');
    }

    const nextStep = step+1;

    if (nextStep < 1 || nextStep > 3) {
      throw new Error('Invalid step');
    }

    this.resetStepsAfter(step);

    this.currentStep = nextStep;
    const inputText = this.stepData[step].outputText;
    this.currentRequestId += 1;
    const requestId = this.currentRequestId;

    try {
      let completionText = await getCompletion(apiKey, getMainStepPrompt(this.stepData, nextStep), undefined, temperature);

      if (completionText === undefined || completionText === null) completionText = '';

      if (requestId !== this.currentRequestId) {
        console.log('Ignoring response for outdated request');
        return;
      }

      const result = await this.addStep(completionText, nextStep);

      if (nextStep === 3) {
        this.setSuccess(result);
        if (!this.autoRetryEnabled || result) return;

        setTimeout(() => {
          if(!this.autoRetryEnabled) return;

          this.handleStep(step, apiKey, temperature);
        }, 1000);
      }
    } catch (error) {
      // TODO - cleanup needed?
      console.error(error);
      alert('Error fetching step data');
    }
  }

  public async addStep(completionText: string, nextStep: number): Promise<boolean> {
    if (nextStep === 3) {
      return await this.runJasmineTestsInWorker(completionText, this.stepData[2].outputText, ({ passedCount, totalCount }) => {
        completionText = completionText.replace(/✅/g, "");
        completionText += `\n\nPassing tests: ${passedCount} / ${totalCount}`;
        if(passedCount == totalCount) completionText += "✅"

        this.stepData.push({
          outputText: (completionText || "").trim(),
          step: nextStep
        });
        this.emit('stepDataChanged');
      });
    } else {
      this.stepData.push({ outputText: (completionText || "").trim(), step: nextStep });
      this.emit('stepDataChanged');
      return true
    }
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

  getSaveData(): { stepData: StepData[] } {
    return {
      stepData: this.stepData,
    };
  }

  loadFunctionData(functionData: any) {
    this.stepData.splice(0, this.stepData.length, ...functionData.stepData);
    this.emit('stepDataChanged');
  }

  public updateStepOutput(index: number, outputText: string): void {
    this.stepData[index].outputText = outputText;
    this.emit('stepDataChanged');
  }

  public getSuccess(): boolean {
    return this.success;
  }

  private setSuccess(success: boolean): void {
    this.success = success;
    this.emit('stepDataChanged');
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
