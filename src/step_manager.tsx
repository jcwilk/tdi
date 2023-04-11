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
  addStepData(
    completionText: string,
    nextStep: number,
    setStepData: (data: StepData[]) => void,
    currentStepData
  ): void {
    if (nextStep === 3) {
      this.runJasmineTestsInWorker(completionText, currentStepData[1].outputText, ({ passedCount, totalCount }) => {
        completionText += `\n\nPassing tests: ${passedCount} / ${totalCount}`;

        setStepData((prevStepData) => {
          return [
            ...prevStepData,
            {
              outputText: (completionText || "").trim(),
              step: nextStep,
              passedCount,
              totalCount
            },
          ];
        });
      });
    } else {
      setStepData((prevStepData) => {
        return [
          ...prevStepData,
          { outputText: (completionText || "").trim(), step: nextStep },
        ];
      });
    }
  }

  resetStepsAfter(stepIndex: number, setStepData: (data: StepData[]) => void): void {
    setStepData((prevStepData) => {
      return prevStepData.filter((_, index) => index <= stepIndex);
    });
  }

  renderStepOutput(stepData: StepData[], handleStep: (nextStep: number) => void): JSX.Element[] {
    const outputElements: JSX.Element[] = [];

    stepData.forEach(({ outputText, step }, index) => {
      outputElements.push(
        <div key={index}>
          <h2>Output Text (Step {step}):</h2>
          <div
            style={{
              maxWidth: '600px',
              lineHeight: '1.5',
              wordWrap: 'break-word',
              backgroundColor: '#f0f0f0',
              padding: '10px',
              borderRadius: '5px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}

          >
            <p style={{ color: '#333' }}>{outputText}</p>
          </div>
          {step < 3 && (
            <button onClick={() => handleStep(step + 1)}>
              Proceed to Step {step + 1}
            </button>
          )}
        </div>
      );
    });

    return outputElements;
  }

  private runJasmineTestsInWorker(functionString: string, jasmineTestsString: string, callback: TestResultsCallback): void {
    const worker = new TesterWorker();

    worker.postMessage({
      functionString,
      jasmineTestsString,
    });

    worker.onmessage = function (event: MessageEvent) {
      const { passedCount, failedCount, totalCount } = event.data;
      callback({ passedCount, failedCount, totalCount });
    };
  }

}
