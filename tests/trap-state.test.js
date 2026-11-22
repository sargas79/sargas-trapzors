import test from "node:test";
import assert from "node:assert/strict";
import { transition, canTrigger, isTerminal } from "../scripts/core/trap-state.js";
import { defaultTrapSystem } from "../scripts/core/trap-defaults.js";

const mk = (over = {}) => ({ ...defaultTrapSystem(), disabled: false, ...over });
const entry = (t = "T1", m = "m1") => ({ tokenUuid: t, movementId: m, userId: "u1", at: 1 });
const trig = (s, e = entry()) => transition(s, { type: "trigger", entry: e });

test("trigger from armed -> pending with promptGM", () => {
  const s = mk();
  const r = trig(s);
  assert.equal(r.ok, true);
  assert.equal(r.state.status, "pending");
  assert.equal(r.state.pending.length, 1);
  assert.deepEqual(r.effects, ["promptGM"]);
  assert.equal(s.status, "armed");
  assert.equal(s.pending.length, 0);
});

test("trigger while pending with new token -> updatePrompt", () => {
  const r1 = trig(mk());
  const r2 = trig(r1.state, entry("T2", "m1"));
  assert.equal(r2.ok, true);
  assert.equal(r2.state.pending.length, 2);
  assert.deepEqual(r2.effects, ["updatePrompt"]);
});

test("duplicate tokenUuid+movementId is not appended", () => {
  const r1 = trig(mk());
  const r2 = trig(r1.state);
  assert.equal(r2.ok, true);
  assert.equal(r2.state.pending.length, 1);
  assert.deepEqual(r2.effects, []);
  // same token, different movement is a new entry
  const r3 = trig(r1.state, entry("T1", "m2"));
  assert.equal(r3.state.pending.length, 2);
});

test("trigger rejected when disabled or spent", () => {
  assert.deepEqual(
    [trig(mk({ disabled: true })).ok, trig(mk({ disabled: true })).reason],
    [false, "disabled"]
  );
  const spent = mk({ status: "spent" });
  const r = trig(spent);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "spent");
  assert.equal(r.state, spent);
});

test("fire single-use -> spent, clears pending, records lastFired", () => {
  const p = trig(mk()).state;
  const r = transition(p, { type: "fire", test: false, at: 99, tokenUuids: ["T1"] });
  assert.equal(r.ok, true);
  assert.equal(r.state.status, "spent");
  assert.deepEqual(r.state.pending, []);
  assert.deepEqual(r.state.lastFired, { at: 99, tokenUuids: ["T1"], worldTime: null });
  assert.deepEqual(r.effects, ["fire"]);
});

test("fire reusable -> armed", () => {
  const p = trig(mk({ reusable: true })).state;
  const r = transition(p, { type: "fire", test: false, at: 5, tokenUuids: [] });
  assert.equal(r.state.status, "armed");
  assert.deepEqual(r.state.pending, []);
});

test("manual fire from armed is allowed", () => {
  const r = transition(mk(), { type: "fire", test: false, at: 1, tokenUuids: [] });
  assert.equal(r.ok, true);
  assert.equal(r.state.status, "spent");
});

test("spent never fires non-test", () => {
  const spent = mk({ status: "spent" });
  const r = transition(spent, { type: "fire", test: false, at: 1, tokenUuids: [] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "spent");
  assert.equal(r.effects, undefined);
  assert.equal(r.state, spent);
});

test("pending never produces a second fire without re-trigger", () => {
  const p = trig(mk({ reusable: true })).state;
  const f1 = transition(p, { type: "fire", test: false, at: 1, tokenUuids: ["T1"] });
  assert.deepEqual(f1.effects, ["fire"]);
  assert.deepEqual(f1.state.pending, []);
  assert.equal(f1.state.status, "armed");
  // firing again is a manual fire from armed, not tied to pending; pending is empty
  const f2 = transition(f1.state, { type: "fire", test: false, at: 2, tokenUuids: [] });
  assert.deepEqual(f2.state.pending, []);
  // single-use: second fire is rejected
  const s1 = transition(trig(mk()).state, { type: "fire", test: false, at: 1, tokenUuids: [] });
  const s2 = transition(s1.state, { type: "fire", test: false, at: 2, tokenUuids: [] });
  assert.equal(s2.ok, false);
});

test("fire rejected while disabled", () => {
  const r = transition(mk({ disabled: true }), { type: "fire", test: false, at: 1, tokenUuids: [] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "disabled");
});

test("test fire from spent is allowed and changes nothing", () => {
  const spent = mk({ status: "spent", disabled: true });
  const before = structuredClone(spent);
  const r = transition(spent, { type: "fire", test: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.effects, ["fireTest"]);
  assert.deepEqual(r.state, before);
  assert.deepEqual(spent, before);
});

test("ignore only from pending", () => {
  const p = trig(mk()).state;
  const r = transition(p, { type: "ignore" });
  assert.equal(r.ok, true);
  assert.equal(r.state.status, "armed");
  assert.deepEqual(r.state.pending, []);
  assert.equal(transition(mk(), { type: "ignore" }).ok, false);
  assert.equal(transition(mk({ status: "spent" }), { type: "ignore" }).ok, false);
});

test("reset from any status clears pending and detection.checked, keeps revealed", () => {
  for (const status of ["armed", "pending", "spent"]) {
    const s = mk({ status, revealed: true, pending: [entry()] });
    s.detection.checked = ["T1", "T2"];
    const r = transition(s, { type: "reset" });
    assert.equal(r.ok, true);
    assert.equal(r.state.status, "armed");
    assert.deepEqual(r.state.pending, []);
    assert.deepEqual(r.state.detection.checked, []);
    assert.equal(r.state.revealed, true);
    assert.deepEqual(s.detection.checked, ["T1", "T2"]);
  }
});

test("disable while pending clears it; enable keeps spent", () => {
  const p = trig(mk()).state;
  const d = transition(p, { type: "disable" });
  assert.equal(d.state.disabled, true);
  assert.equal(d.state.status, "armed");
  assert.deepEqual(d.state.pending, []);
  const dArmed = transition(mk(), { type: "disable" });
  assert.equal(dArmed.state.status, "armed");
  const spentDisabled = mk({ status: "spent", disabled: true });
  const e = transition(spentDisabled, { type: "enable" });
  assert.equal(e.state.disabled, false);
  assert.equal(e.state.status, "spent");
});

test("unknown action rejected, state unchanged", () => {
  const s = mk();
  const r = transition(s, { type: "explode" });
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(transition(s, undefined).ok, false);
});

test("canTrigger / isTerminal helpers", () => {
  assert.equal(canTrigger(mk()), true);
  assert.equal(canTrigger(mk({ status: "pending" })), true);
  assert.equal(canTrigger(mk({ status: "spent" })), false);
  assert.equal(canTrigger(mk({ disabled: true })), false);
  assert.equal(isTerminal(mk({ status: "spent" })), true);
  assert.equal(isTerminal(mk()), false);
});

test("inputs are never mutated", () => {
  const s = mk();
  const frozen = structuredClone(s);
  trig(s);
  transition(s, { type: "fire", test: false, at: 1, tokenUuids: ["a"] });
  transition(s, { type: "reset" });
  transition(s, { type: "disable" });
  assert.deepEqual(s, frozen);
});

test("fire stores the world time in lastFired", () => {
  const r = transition(mk(), { type: "fire", at: 5, tokenUuids: [], worldTime: 1234 });
  assert.equal(r.state.lastFired.worldTime, 1234);
});

test("a reusable trap with a re-arm timer is spent until re-armed; without one it re-arms at once", () => {
  const fire = (s) => transition(s, { type: "fire", at: 1, tokenUuids: [], worldTime: 10 });
  assert.equal(fire(mk({ reusable: true })).state.status, "armed");
  assert.equal(fire(mk({ reusable: true, rearmSeconds: 60 })).state.status, "spent");
  assert.equal(fire(mk({ reusable: false, rearmSeconds: 60 })).state.status, "spent");
});

test("a running hazard encounter blocks triggering, even for an armed trap", () => {
  const running = mk({ encounter: { tokenId: "tok", combatId: "cmb" } });
  assert.equal(canTrigger(running), false);
  const r = trig(running);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-triggerable");
  assert.equal(canTrigger(mk({ encounter: { tokenId: null, combatId: null } })), true);
  assert.equal(canTrigger({ ...mk(), encounter: undefined }), true, "old state without encounter still triggers");
});

test("reset keeps the state shape and a reusable trap is armed again", () => {
  const r = transition(mk({ status: "spent", encounter: { tokenId: "tok", combatId: "cmb" } }), { type: "reset" });
  assert.equal(r.ok, true);
  assert.equal(r.state.status, "armed");
});
