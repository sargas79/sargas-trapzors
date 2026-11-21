import test from "node:test";
import assert from "node:assert/strict";
import { makeTriggerKey, createDeduper, createBatcher, NO_MOVEMENT } from "../scripts/core/dedupe.js";

test("makeTriggerKey is stable and handles missing movementId", () => {
  assert.equal(makeTriggerKey("a", "b", "c"), makeTriggerKey("a", "b", "c"));
  assert.notEqual(makeTriggerKey("a", "b", "c"), makeTriggerKey("a", "b", "d"));
  assert.equal(makeTriggerKey("a", "b", null), makeTriggerKey("a", "b", undefined));
  assert.ok(makeTriggerKey("a", "b", null).endsWith(NO_MOVEMENT));
  assert.notEqual(makeTriggerKey("a", "b", null), makeTriggerKey("a", "b", "c"));
});

test("deduper TTL with injected clock", () => {
  let t = 1000;
  const d = createDeduper({ ttlMs: 100, now: () => t });
  assert.equal(d.checkAndAdd("k"), true);
  assert.equal(d.has("k"), true);
  assert.equal(d.checkAndAdd("k"), false);
  t += 99;
  assert.equal(d.has("k"), true);
  t += 1;
  assert.equal(d.has("k"), false);
  assert.equal(d.checkAndAdd("k"), true);
  d.add("x");
  t += 500;
  d.prune();
  assert.equal(d.has("x"), false);
  assert.equal(d.has("k"), false);
});

function fakeTimers() {
  let id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimer: (i) => { timers.delete(i); },
    fireAll() { for (const [i, t] of [...timers]) { timers.delete(i); t.fn(); } },
    timers
  };
}

test("batcher flushes once per trap with all entries", () => {
  const ft = fakeTimers();
  const flushed = [];
  const b = createBatcher({ windowMs: 300, ...ft, onFlush: (id, e) => flushed.push([id, e]) });
  b.add("trapA", 1);
  b.add("trapB", "x");
  b.add("trapA", 2);
  b.add("trapA", 3);
  assert.equal(ft.timers.size, 2);
  assert.ok([...ft.timers.values()].every((t) => t.ms === 300));
  assert.deepEqual(flushed, []);
  ft.fireAll();
  assert.deepEqual(flushed, [["trapA", [1, 2, 3]], ["trapB", ["x"]]]);
  ft.fireAll();
  assert.equal(flushed.length, 2);
  // new batch after flush starts a new window
  b.add("trapA", 4);
  assert.equal(ft.timers.size, 1);
});

test("batcher flushAll and cancel", () => {
  const ft = fakeTimers();
  const flushed = [];
  const b = createBatcher({ ...ft, onFlush: (id, e) => flushed.push([id, e]) });
  b.add("a", 1);
  b.add("b", 2);
  b.cancel("b");
  b.flushAll();
  assert.deepEqual(flushed, [["a", [1]]]);
  assert.equal(ft.timers.size, 0);
  b.cancel("nope");
  b.flushAll();
  assert.equal(flushed.length, 1);
});
