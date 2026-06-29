/// <reference types="vitest/config" />
import { makeTestConfig } from "./vitest.config";

// Unit-only scope for Stryker mutation runs: src/** unit tests only, never the
// slow real-DB/network tests/integration/**. Referenced by stryker.config.mjs.
export default makeTestConfig(["src/**/*.{test,spec}.{ts,tsx}"]);
