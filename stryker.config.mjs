// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  // ponytail: unit-only config keeps slow real-DB/network tests/integration/** out of mutation runs
  vitest: { configFile: "vitest.config.unit.ts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  // ponytail: mutate only src, not tests or generated files
  mutate: ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.test.tsx"],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  timeoutMS: 30000,
};
