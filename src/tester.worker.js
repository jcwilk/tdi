importScripts('/jasmine/jasmine.js');

// Create a Jasmine environment using jasmineRequire
const jasmineCore = self.jasmineRequire.core(self.jasmineRequire);
const jasmineEnv = jasmineCore.getEnv();

jasmineEnv.configure({
  random: false,
  oneFailurePerSpec: false,
  hideDisabled: false,
});

// Simple Jasmine environment setup
self.jasmine = jasmineCore;
jasmine.getEnv = () => jasmineEnv;

// Manually create the Jasmine interface
const jasmineInterface = {
  describe: jasmineEnv.describe,
  xdescribe: jasmineEnv.xdescribe,
  fdescribe: jasmineEnv.fdescribe,
  it: jasmineEnv.it,
  xit: jasmineEnv.xit,
  fit: jasmineEnv.fit,
  beforeEach: jasmineEnv.beforeEach,
  afterEach: jasmineEnv.afterEach,
  beforeAll: jasmineEnv.beforeAll,
  afterAll: jasmineEnv.afterAll,
  expect: jasmineEnv.expect,
  pending: jasmineEnv.pending,
  fail: jasmineEnv.fail,
  spyOn: jasmineEnv.spyOn,
};

self.onmessage = function (event) {
  const { functionString, jasmineTestsString } = event.data;

  // Evaluate the function code
  eval(functionString);

  // Make the Jasmine functions available in the global scope
  const { describe, it, expect, beforeEach, afterEach } = jasmineInterface;
  self.describe = describe;
  self.it = it;
  self.expect = expect;
  self.beforeEach = beforeEach;
  self.afterEach = afterEach;

  // Create a custom reporter to collect test results
  const testResults = {
    passedCount: 0,
    failedCount: 0,
    totalCount: 0,
  };

  const customReporter = {
    specDone: function (result) {
      testResults.totalCount++;
      if (result.status === 'passed') {
        testResults.passedCount++;
      } else {
        testResults.failedCount++;
      }
    },
  };

  jasmine.getEnv().addReporter(customReporter);

  // Run Jasmine tests
  eval(jasmineTestsString);

  // Execute tests and wait for completion
  jasmine.getEnv().execute().then(() => {
    // Send the results back to the main thread
    self.postMessage(testResults);
    self.close();
  });
};
