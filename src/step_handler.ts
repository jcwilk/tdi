import { StepData, StepManager } from './step_manager';
import { getMainStepPrompt } from './prompt_factory';
import { getCompletion } from './openai_api';
import TesterWorker from "./tester.worker";

export type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class StepHandler {
  private stepManager: StepManager;
  private currentRequestId: number;

  constructor(stepManager: StepManager) {
    this.stepManager = stepManager;
    this.currentRequestId = 0;
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

    this.stepManager.resetStepsAfter(step);

    this.currentRequestId += 1;
    const requestId = this.currentRequestId;

    try {
      let completionText = await getCompletion(apiKey, getMainStepPrompt(this.stepManager.getStepData(), nextStep), undefined, temperature);

      if (completionText === undefined || completionText === null) completionText = '';

      if (requestId !== this.currentRequestId) {
        console.log('Ignoring response for outdated request');
        return;
      }

      const result = await this.addStep(completionText, nextStep);

      if (nextStep === 3) {
        this.stepManager.setSuccess(result);
        if (!this.stepManager.isAutoRetryEnabled() || result) return;

        setTimeout(() => {
          if(!this.stepManager.isAutoRetryEnabled()) return;

          this.handleStep(step, apiKey, temperature);
        }, 1000);
      } else {
        this.stepManager.setSuccess(false);
      }

      return;
    } catch (error) {
      // TODO - cleanup needed?
      console.error(error);
      alert('Error fetching step data');
    }
    return;
  }

  private async addStep(
    completionText: string,
    nextStep: number
  ): Promise<boolean> {
    let result = true;
    if (nextStep === 3) {
      result = await this.runJasmineTestsInWorker(completionText, this.stepManager.getStepData()[2].outputText, ({ passedCount, totalCount }) => {
        completionText = completionText.replace(/✅/g, "");
        completionText += `\n\nPassing tests: ${passedCount} / ${totalCount}`;
        if(passedCount == totalCount) completionText += "✅"
      });
    }

    this.stepManager.addStep(completionText || "", nextStep);
    return result;
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
