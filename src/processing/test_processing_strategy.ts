import { ProcessingStrategy } from "./processing_strategy"
import { KeyValuePairs } from "../step"
import { StrategySpec } from "../scenarios";

// can't for the life of me figure out how to get TS to STFU about
// the following import. works great and I've lost too much time to
// it, so something to figure out later (or never)
// @ts-ignore
import TesterWorker from "../tester.worker";

type TestResultsCallback = (results: {
  passedCount: number;
  failedCount: number;
  totalCount: number;
}) => void;

export class TestProcessingStrategy extends ProcessingStrategy {
  async process(key: string, spec: StrategySpec, dependentData: KeyValuePairs, temperature: number, callback: (output: string) => void): Promise<void> {
    if (typeof(spec) !== 'object' || Array.isArray(spec)) return

    const { test, code } = spec;
    const testData = dependentData[test];
    const codeData = dependentData[code];
    let output = "";
    const testResult = await this.runJasmineTestsInWorker(codeData, testData, ({ passedCount, totalCount }) => {
      output = `Passing tests: ${passedCount} / ${totalCount}`;
    });

    if (testResult) output += "✅";

    callback(output)
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
