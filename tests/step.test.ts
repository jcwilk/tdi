jest.mock('../src/tester.worker', () => {
  return class MockWorker {
    constructor() {}
    postMessage() {}
    addEventListener() {}
    terminate() {}
  };
});
import { Step } from '../src/step';
import { generateEmptyStepSpec } from '../src/scenarios';
import { getCompletion } from '../src/openai_api';

jest.mock('../src/openai_api', () => ({
  getCompletion: jest.fn(),
}));

describe('Step', () => {
  let step: Step;

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    step = new Step();
  });

  it('updates spec and clears output data', () => {
    const stepSpec = generateEmptyStepSpec();
    stepSpec.input = { name: 'Name' };
    step.setSpec(stepSpec);
    step.setOutputData('name', 'Test Name');
    const newSpec = generateEmptyStepSpec();
    step.setSpec(newSpec);
    expect(step.getOutputData()).toEqual({});
  });

  it('sets and gets temperature', () => {
    step.setTemperature(0.5);
    expect(step.getTemperature()).toBe(0.5);
  });

  it('runs completion without calling the API if dependents are not satisfied', async () => {
    const step = new Step();
    step.setSpec({
      description: 'Test step',
      depends: ['dependency1'],
      input: { input1: 'Test input /dependency1' },
      completion: { output: 'Test prompt /dependency1' },
      test: {},
    });

    const mockGetCompletion = getCompletion as jest.Mock;
    const dependentData = { dependency1: '' };

    const result = await step.runCompletion(dependentData);

    expect(result).toBe(false);
    expect(mockGetCompletion).not.toHaveBeenCalled();
  });

  it('runs completion and calls the API if dependents are satisfied', async () => {
    const step = new Step();
    step.setSpec({
      description: 'Test step',
      depends: ['dependency1'],
      input: { input1: 'Test input /dependency1' },
      completion: { output: 'Test prompt /dependency1' },
      test: {},
    });

    const mockGetCompletion = getCompletion as jest.Mock;
    mockGetCompletion.mockResolvedValue('Test output');

    const dependentData = { dependency1: 'Test value' };

    const result = await step.runCompletion(dependentData);

    expect(result).toBe(true);
    expect(mockGetCompletion).toHaveBeenCalledTimes(1);
    expect(mockGetCompletion).toHaveBeenCalledWith('Test prompt Test value', 1);
  });
});
