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
  let receivedOutputData: { [key: string]: string };

  afterEach(() => {
    step.destroy();
    jest.clearAllMocks();
  });

  beforeEach(() => {
    step = new Step();
    receivedOutputData = {};
    step.subscribe((updates: { [key: string]: string }) => {
      receivedOutputData = { ...receivedOutputData, ...updates };
    });
  });

  it('sets and gets temperature', () => {
    step.setTemperature(0.5);
    expect(step.getTemperature()).toBe(0.5);
  });

  it('runs completion without calling the API if dependents are not satisfied', async () => {
    step.setSpec({
      description: 'Test step',
      depends: ['dependency1'],
      input: { input1: 'Test input /dependency1' },
      completion: { output: 'Test prompt /dependency1' },
      test: {},
      chat: {},
    }, {});

    const mockGetCompletion = getCompletion as jest.Mock;
    const dependentData = { dependency1: '' };

    const result = await step.runCompletion(dependentData);

    expect(result).toBe(false);
    expect(mockGetCompletion).not.toHaveBeenCalled();
    expect(receivedOutputData.output).toEqual(undefined);
  });

  it('runs completion and calls the API if dependents are satisfied', async () => {
    step.setSpec({
      description: 'Test step',
      depends: ['dependency1'],
      input: { input1: 'Test input /dependency1' },
      completion: { output: 'Test prompt /dependency1' },
      test: {},
      chat: {},
    }, {});

    const mockGetCompletion = getCompletion as jest.Mock;
    mockGetCompletion.mockImplementation((_prompt, _probability, callback) => {
      callback('Test output');
      return Promise.resolve();
    });

    const dependentData = { dependency1: 'Test value' };

    const result = await step.runCompletion(dependentData);

    expect(result).toBe(true);
    expect(mockGetCompletion).toHaveBeenCalledTimes(1);
    expect(mockGetCompletion).toHaveBeenCalledWith('Test prompt Test value', expect.any(Number), expect.any(Function));
    expect(receivedOutputData.output).toBe('Test output');
  });
});
