import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../scripts/foundry/logger.js";

function setup(isGM, debug) {
  const calls = [];
  const sink = {};
  for (const m of ["debug", "info", "warn", "error"]) sink[m] = (...a) => calls.push([m, ...a]);
  const log = createLogger({ prefix: "p", isGM: () => isGM, isDebugEnabled: () => debug, sink });
  for (const m of ["debug", "info", "warn", "error"]) log[m]("msg");
  return calls.map((c) => c[0]);
}

test("GM with debug logs everything", () => {
  assert.deepEqual(setup(true, true), ["debug", "info", "warn", "error"]);
});

test("GM without debug logs only warn/error", () => {
  assert.deepEqual(setup(true, false), ["warn", "error"]);
});

test("player never logs", () => {
  assert.deepEqual(setup(false, true), []);
  assert.deepEqual(setup(false, false), []);
});

test("prefix is prepended", () => {
  const calls = [];
  const log = createLogger({ prefix: "pre", isGM: () => true, isDebugEnabled: () => true, sink: { debug: (...a) => calls.push(a), info() {}, warn() {}, error() {} } });
  log.debug("hello", 1);
  assert.deepEqual(calls[0], ["pre |", "hello", 1]);
});
