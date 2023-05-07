import { StepData } from './step_manager';

export function getMainStepPrompt(stepData: StepData[], nextStep: number): string {
  if (nextStep === 1) {
    return `Given the following request:
START problem definition
${stepData[0].outputText}
END problem definition
Please produce or describe example instances of the problem being described.

Sure! Here's some examples:
`
  } else if (nextStep === 2) {
    return `Please produce or describe jasmine test cases which could be used to verify the problem was solved for the following problem:
START problem definition
${stepData[0].outputText}
END problem definition
which would be expected to be compatible with at least the following examples:
START examples
${stepData[1].outputText}
END examples
Please write test cases in Jasmine to confirm a hypothetical solution to this problem for the examples given.

Sure! Here are the Jasmine test cases:
`;
  } else {
    return `Given the following problem:
START problem definition
${stepData[0].outputText}
END problem definition
and the following Jasmine test cases which will be used to verify the problem being solved:
START verification method
${stepData[2].outputText}
END verification method
Please write a global javascript function to solve this problem in the most generalized way possible, within constraints of the "problem definition".
It should also pass all of the Jasmine test cases.

Sure! Here's the global javascript function:
`
  }
}

export function getNamePrompt(stepData: StepData[]): string {
  const description = stepData[0].outputText;
  return `Given the following problem:
START problem definition
${description}
END problem definition
Please provide a title for the tool used to solve this solution. The title should be a short, descriptive name for the tool and useful
for identifying it in a list of similar tools. The title should be at most a single sentence, and should not include any special
characters or punctuation and should omit the ending punctuation.

Sure! Here's the title:
`
}
