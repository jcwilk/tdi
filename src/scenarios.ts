export type TDITestSteps = {
  [key: string]: {
    test: string;
    code: string;
  };
};

export type TDIStep = {
  description: string;
  depends: string[];
  input: {
    [key: string]: string;
  };
  completion: {
    [key: string]: string;
  };
  test: TDITestSteps;
};

export const generateEmptyStepSpec = (): TDIStep => {
  return {
    description: "",
    depends: [],
    input: {},
    completion: {},
    test: {},
  };
}

export const BasicTDISteps: TDIStep[] = [
  {
    description: "Generate Examples",
    depends: [],
    input: {
      problem_description: ""
    },
    completion: {
      examples: `Given the following request:
START problem definition
/problem_description
END problem definition
Please produce or describe example instances of the problem being described.

Sure! Here's some examples:
`,
      name: `Given the following problem:
START problem definition
/problem_description
END problem definition
Please provide a title for the tool used to solve this solution. The title should be a short, descriptive name for the tool and useful
for identifying it in a list of similar tools. The title should be at most a single sentence, and should not include any special
characters or punctuation and should omit the ending punctuation.

Sure! Here's the title:
`
    },
    test: {}
  },
  {
    description: "Generate Jasmine Tests",
    depends: ["problem_description", "examples"],
    input: {},
    completion: {
      jasmine: `Please produce or describe jasmine test cases which could be used to verify the problem was solved for the following problem:
START problem definition
/problem_description
END problem definition
which would be expected to be compatible with at least the following examples:
START examples
/examples
END examples
Please write test cases in Jasmine to confirm a hypothetical solution to this problem for the examples given.

Sure! Here are the Jasmine test cases:
`
    },
    test: {}
  },
  {
    description: "Generate Function",
    depends: ["problem_description", "jasmine"],
    input: {},
    completion: {
      function: `Given the following problem:
START problem definition
/problem_description
END problem definition
and the following Jasmine test cases which will be used to verify the problem being solved:
START verification method
/jasmine
END verification method
Please write a global javascript function to solve this problem in the most generalized way possible, within constraints of the "problem definition".
It should also pass all of the Jasmine test cases.

Sure! Here's the global javascript function:
`
    },
    test: {}
  },
  {
    description: "Test Function",
    depends: ["jasmine", "function"],
    input: {},
    completion: {},
    test: {
      success: {
        test: "jasmine",
        code: "function"
      }
    }
  }
];
