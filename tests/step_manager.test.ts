jest.mock('../src/tester.worker', () => {
  return class MockWorker {
    constructor() {}
    postMessage() {}
    addEventListener() {}
    terminate() {}
  };
});
import { StepManager } from '../src/step_manager';
import { Step } from '../src/step';
import { generateEmptyStepSpec } from '../src/scenarios';

describe('StepManager', () => {
  let stepManager;

  beforeEach(() => {
    stepManager = new StepManager([]);
  });

  it('adds a new step', () => {
    const stepManager = new StepManager([]);
    const step = stepManager.addStep();
    expect(stepManager.getSteps().length).toBe(1);
    expect(stepManager.getSteps()[0]).toBeInstanceOf(Step);
  });

  it('deletes a step', () => {
    const stepManager = new StepManager([]);
    stepManager.addStep();
    stepManager.deleteAt(0);
    expect(stepManager.getSteps().length).toBe(0);
  });

  it('moves a step', () => {
    const stepManager = new StepManager([]);
    const step1 = stepManager.addStep();
    const step2 = stepManager.addStep();
    stepManager.moveStep(step1.uuid, step2.uuid);
    expect(stepManager.getSteps()[0]).toBe(step2);
    expect(stepManager.getSteps()[1]).toBe(step1);
  });

  it('sets and gets name', () => {
    const stepManager = new StepManager([]);
    stepManager.setName('Test Name');
    expect(stepManager.getName()).toBe('Test Name');
  });

  it('updates dependentData on step update', () => {
    const stepManager = new StepManager([]);
    const step = stepManager.addStep();
    const stepSpec = generateEmptyStepSpec();
    stepSpec.input = { name: 'Name' };
    step.setSpec(stepSpec);
    step.setOutputData('name', 'Test Name');
    expect(stepManager.getDependentData().name).toBe('Test Name');
  });
});
