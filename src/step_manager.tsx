import React from 'react';

export interface StepData {
  outputText: string;
  step: number;
}

export class StepManager {
  getCompletionPrompt(inputText: string, stepData: StepData[], nextStep: number): string {
    let prompt;
    if (nextStep === 1) {
      prompt = `Given the following request:
START problem definition
${inputText}
END problem definition
Please produce or describe example instances of the problem being described.

Sure! Here's some examples:
`
    } else if (nextStep === 2) {
      prompt = `Please produce or describe jasmine test cases which could be used to verify the problem was solved for the following problem:
START problem definition
${inputText}
END problem definition
which would be expected to be compatible with at least the following examples:
START examples
${stepData[0].outputText}
END examples
Please write test cases in Jasmine to confirm a hypothetical solution to this problem for the examples given.

Sure! Here are the Jasmine test cases:
`;
    } else {
      prompt = `Given the following problem:
START problem definition
${inputText}
END problem definition
and the following Jasmine test cases which will be used to verify the problem being solved:
START verification method
${stepData[1].outputText}
END verification method
Please write a javascript function to solve this problem in the most generalized way possible, within constraints of the "problem definition".
It should also pass all of the Jasmine test cases.

Sure! Here's the javascript function:
`
    }

    return prompt;
  }

  addStepData(completionText: string, nextStep: number, setStepData: (data: StepData[]) => void): void {
    setStepData((prevStepData) => {
      return [...prevStepData, { outputText: (completionText || '').trim(), step: nextStep }];
    });
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
}
