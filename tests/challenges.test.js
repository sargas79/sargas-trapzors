import test from "node:test";
import assert from "node:assert/strict";
import {
  crossedTriggers, triggerCrossed, resolveBandId, crossingWhat, triggerBroken, challengeBroken,
  effectFor, hasChallenge, defaultChallenge, whensForMode, MAX_TRIGGERS
} from "../scripts/core/challenges.js";
import { formToChallenge, formToTrapUpdate } from "../scripts/core/trap-form.js";
import { migrateTrapSystem } from "../scripts/core/schema-migrate.js";
import { defaultTrapSystem } from "../scripts/core/trap-defaults.js";

const progress = (current, extra = {}) => ({ id: "p", title: "Alarm", mode: "progress", current, target: 6, status: "running", ...extra });
const steps = (current, extra = {}) => ({
  id: "s", title: "Clock", mode: "steps", current, target: 6, status: "running",
  steps: [{ id: "s2", value: 2, label: "Two" }, { id: "s4", value: 4, label: "Four" }], ...extra
});
const ladder = (current, extra = {}) => ({
  id: "t", title: "Heat", mode: "threshold", current, status: "running",
  thresholds: [{ id: "cold", value: 0, label: "Cold" }, { id: "warm", value: 5, label: "Warm" }, { id: "hot", value: 10, label: "Hot" }],
  ...extra
});
const trig = (extra) => ({ trackId: "p", when: "reaches", value: 3, stepId: null, bandId: null, action: "ask", ...extra });
const fired = (prev, next, t) => crossedTriggers(prev, next, [t]).length === 1;

test("reaches: fires only when going up through the value", () => {
  const t = trig();
  assert.equal(fired([progress(2)], [progress(3)], t), true);
  assert.equal(fired([progress(1)], [progress(5)], t), true); // jumped over it
  assert.equal(fired([progress(3)], [progress(4)], t), false); // already there
  assert.equal(fired([progress(4)], [progress(2)], t), false); // going down
  assert.equal(fired([progress(0)], [progress(2)], t), false);
});

test("reaches: re-arms only after dropping below the value", () => {
  const t = trig();
  assert.equal(fired([progress(2)], [progress(3)], t), true);
  assert.equal(fired([progress(3)], [progress(4)], t), false);
  assert.equal(fired([progress(4)], [progress(3)], t), false); // drop to the value, still not below
  assert.equal(fired([progress(3)], [progress(2)], t), false);
  assert.equal(fired([progress(2)], [progress(3)], t), true); // fired again after re-crossing
});

test("reaches works on step tracks and never on threshold tracks", () => {
  assert.equal(fired([steps(1)], [steps(3)], trig({ trackId: "s", value: 3 })), true);
  assert.equal(fired([ladder(4)], [ladder(6)], trig({ trackId: "t", value: 5 })), false);
});

test("reaches needs a usable value", () => {
  assert.equal(fired([progress(0)], [progress(5)], trig({ value: null })), false);
  assert.equal(fired([progress(0)], [progress(5)], trig({ value: "" })), false);
});

test("step: fires only when landing exactly on the step", () => {
  const t = trig({ trackId: "s", when: "step", value: null, stepId: "s4" });
  assert.equal(fired([steps(3)], [steps(4)], t), true);
  assert.equal(fired([steps(5)], [steps(4)], t), true); // landing from above counts
  assert.equal(fired([steps(3)], [steps(5)], t), false); // jumped over it
  assert.equal(fired([steps(4)], [steps(4, { title: "renamed" })], t), false); // value did not change
  assert.equal(fired([steps(4)], [steps(5)], t), false); // leaving it
});

test("step: re-arms after leaving the step and coming back", () => {
  const t = trig({ trackId: "s", when: "step", value: null, stepId: "s4" });
  assert.equal(fired([steps(3)], [steps(4)], t), true);
  assert.equal(fired([steps(4)], [steps(5)], t), false);
  assert.equal(fired([steps(5)], [steps(4)], t), true);
});

test("step: unknown step, or a non-steps track, never fires", () => {
  assert.equal(fired([steps(3)], [steps(4)], trig({ trackId: "s", when: "step", stepId: "gone" })), false);
  assert.equal(fired([steps(3)], [steps(4)], trig({ trackId: "s", when: "step", stepId: null })), false);
  assert.equal(fired([progress(1)], [progress(2)], trig({ when: "step", stepId: "s2" })), false);
});

test("band: fires when the resolved band changes to the chosen band, in either direction", () => {
  const t = trig({ trackId: "t", when: "band", value: null, bandId: "warm" });
  assert.equal(fired([ladder(4)], [ladder(5)], t), true); // up into warm
  assert.equal(fired([ladder(10)], [ladder(7)], t), true); // down into warm
  assert.equal(fired([ladder(5)], [ladder(8)], t), false); // still warm
  assert.equal(fired([ladder(4)], [ladder(3)], t), false);
  assert.equal(fired([ladder(7)], [ladder(11)], t), false); // leaving warm
});

test("band: re-arms after leaving the band; below every rung has no band", () => {
  const t = trig({ trackId: "t", when: "band", value: null, bandId: "cold" });
  assert.equal(fired([ladder(-3)], [ladder(0)], t), true); // from below every rung into cold
  assert.equal(fired([ladder(0)], [ladder(5)], t), false);
  assert.equal(fired([ladder(5)], [ladder(2)], t), true);
});

test("band: unknown band or a non-threshold track never fires", () => {
  assert.equal(fired([ladder(4)], [ladder(6)], trig({ trackId: "t", when: "band", bandId: "gone" })), false);
  assert.equal(fired([progress(2)], [progress(3)], trig({ when: "band", bandId: "warm" })), false);
});

test("band is resolved from each snapshot's own ladder", () => {
  const prev = ladder(6);
  const next = ladder(6, { thresholds: [{ id: "cold", value: 0 }, { id: "warm", value: 7 }] });
  // the ladder moved under the track: warm became cold at the same value
  assert.equal(fired([prev], [next], trig({ trackId: "t", when: "band", bandId: "cold" })), true);
});

test("complete: fires on the transition to complete only", () => {
  const t = trig({ when: "complete", value: null });
  assert.equal(fired([progress(5)], [progress(6, { status: "complete" })], t), true);
  assert.equal(fired([progress(6, { status: "complete" })], [progress(6, { status: "complete" })], t), false);
  assert.equal(fired([progress(6, { status: "complete" })], [progress(5)], t), false);
  assert.equal(fired([progress(5)], [progress(5)], t), false);
  // re-arms once the track is no longer complete
  assert.equal(fired([progress(5)], [progress(6, { status: "complete" })], t), true);
  assert.equal(fired([steps(3)], [steps(6, { status: "complete" })], trig({ trackId: "s", when: "complete" })), true);
});

test("a track missing from next, or from prev, never fires", () => {
  assert.deepEqual(crossedTriggers([progress(2)], [], [trig()]), []);
  assert.deepEqual(crossedTriggers([], [progress(5)], [trig()]), []); // a brand new track has no history
  assert.deepEqual(crossedTriggers([progress(2)], [steps(9)], [trig()]), []);
  assert.deepEqual(crossedTriggers([progress(2)], [progress(5)], [trig({ trackId: null })]), []);
  assert.deepEqual(crossedTriggers(null, null, null), []);
});

test("crossedTriggers reports index, trigger and the new track; several triggers and tracks", () => {
  const triggers = [trig({ value: 2 }), trig({ trackId: "s", when: "step", value: null, stepId: "s2" }), trig({ value: 9 }), trig({ trackId: "gone" })];
  const out = crossedTriggers([progress(1), steps(1)], [progress(4), steps(2)], triggers);
  assert.deepEqual(out.map((c) => c.index), [0, 1]);
  assert.equal(out[0].trigger, triggers[0]);
  assert.equal(out[0].track.current, 4);
});

test("at most 3 triggers are considered", () => {
  const triggers = Array.from({ length: 5 }, () => trig({ value: 1 }));
  assert.equal(crossedTriggers([progress(0)], [progress(1)], triggers).length, MAX_TRIGGERS);
});

test("resolveBandId matches Victory Counter's rule and ignores order", () => {
  const th = [{ id: "c", value: 0 }, { id: "w", value: 5 }, { id: "h", value: 10 }];
  assert.equal(resolveBandId(-1, th), null);
  assert.equal(resolveBandId(0, th), "c");
  assert.equal(resolveBandId(9, th), "w");
  assert.equal(resolveBandId(10, th), "h");
  assert.equal(resolveBandId(7, [...th].reverse()), "w");
  assert.equal(resolveBandId("x", th), null);
  assert.equal(resolveBandId(3, undefined), null);
});

test("crossingWhat describes the crossing", () => {
  assert.deepEqual(crossingWhat(trig({ value: 3 }), progress(3)), { kind: "reaches", label: "3" });
  assert.deepEqual(crossingWhat(trig({ when: "step", stepId: "s4" }), steps(4)), { kind: "step", label: "Four" });
  assert.deepEqual(crossingWhat(trig({ when: "band", bandId: "warm" }), ladder(5)), { kind: "band", label: "Warm" });
  assert.deepEqual(crossingWhat(trig({ when: "complete" }), progress(6)), { kind: "complete", label: "" });
  assert.equal(crossingWhat(trig({ when: "step", stepId: "s2" }), steps(2, { steps: [{ id: "s2", value: 2, label: "" }] })).label, "2");
});

test("whensForMode", () => {
  assert.deepEqual(whensForMode("progress"), ["reaches", "complete"]);
  assert.deepEqual(whensForMode("steps"), ["reaches", "step", "complete"]);
  assert.deepEqual(whensForMode("threshold"), ["band", "complete"]);
});

test("broken links: deleted track, step or band", () => {
  const tracks = [progress(1), steps(1), ladder(1)];
  assert.equal(triggerBroken(trig(), tracks), false);
  assert.equal(triggerBroken(trig({ trackId: "gone" }), tracks), true);
  assert.equal(triggerBroken(trig({ trackId: null }), tracks), false); // an unused slot is not broken
  assert.equal(triggerBroken(trig({ trackId: "s", when: "step", stepId: "nope" }), tracks), true);
  assert.equal(triggerBroken(trig({ trackId: "t", when: "band", bandId: "warm" }), tracks), false);
  const ch = defaultChallenge();
  assert.equal(challengeBroken(ch, tracks), false);
  ch.effects.fired = { trackId: "gone", delta: 1 };
  assert.equal(challengeBroken(ch, tracks), true);
  assert.equal(challengeBroken(null, tracks), false);
});

test("effects and hasChallenge", () => {
  const ch = defaultChallenge();
  assert.equal(hasChallenge(ch), false);
  assert.equal(effectFor(ch, "fired"), null);
  ch.effects.noticed = { trackId: "p", delta: -2 };
  assert.deepEqual(effectFor(ch, "noticed"), { trackId: "p", delta: -2 });
  assert.equal(hasChallenge(ch), true);
  ch.effects.noticed.delta = 0;
  assert.equal(effectFor(ch, "noticed"), null); // a zero change is inert
  assert.equal(hasChallenge(ch), false);
  ch.triggers.push(trig());
  assert.equal(hasChallenge(ch), true);
  assert.equal(hasChallenge(undefined), false);
});

/* ---- form mapping ---- */

test("formToChallenge maps rows, drops unused slots and stores only the fields that apply", () => {
  const res = formToChallenge({
    triggers: {
      0: { trackId: "p", when: "reaches", value: "3", stepId: "x", bandId: "y", action: "fire" },
      1: { trackId: "", when: "reaches", value: "9" },
      2: { trackId: "s", when: "step", stepId: "s4", action: "ask" }
    },
    effects: { fired: { trackId: "p", delta: "2" }, noticed: { trackId: "", delta: "5" }, disabled: { trackId: "p", delta: "-1" } }
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.triggers, [
    { trackId: "p", when: "reaches", value: 3, stepId: null, bandId: null, action: "fire" },
    { trackId: "s", when: "step", value: null, stepId: "s4", bandId: null, action: "ask" }
  ]);
  assert.deepEqual(res.value.effects, {
    fired: { trackId: "p", delta: 2 }, noticed: { trackId: null, delta: 0 }, disabled: { trackId: "p", delta: -1 }
  });
});

test("formToChallenge accepts arrays and a missing form", () => {
  const res = formToChallenge({ triggers: [{ trackId: "t", when: "band", bandId: "warm" }, { trackId: "p", when: "complete" }] });
  assert.equal(res.ok, true);
  assert.equal(res.value.triggers[0].action, "ask");
  assert.deepEqual(res.value.triggers[1], { trackId: "p", when: "complete", value: null, stepId: null, bandId: null, action: "ask" });
  assert.deepEqual(formToChallenge(undefined).value, defaultChallenge());
});

test("formToChallenge validates", () => {
  const bad = (row, key) => {
    const res = formToChallenge({ triggers: [row] });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.key.endsWith(key)), key);
  };
  bad({ trackId: "p", when: "nope" }, "ChallengeWhen");
  bad({ trackId: "p", when: "reaches", value: "" }, "ChallengeValue");
  bad({ trackId: "p", when: "reaches", value: "0" }, "ChallengeValue");
  bad({ trackId: "p", when: "reaches", value: "2.5" }, "ChallengeValue");
  bad({ trackId: "s", when: "step", stepId: "" }, "ChallengeStep");
  bad({ trackId: "t", when: "band" }, "ChallengeBand");
  bad({ trackId: "p", when: "complete", action: "boom" }, "ChallengeAction");
  const res = formToChallenge({ effects: { fired: { trackId: "p", delta: "abc" } } });
  assert.ok(res.errors.some((e) => e.key.endsWith("ChallengeDelta")));
  const four = formToChallenge({ triggers: Array.from({ length: 4 }, () => ({ trackId: "p", when: "complete" })) });
  assert.ok(four.errors.some((e) => e.key.endsWith("ChallengeMax")));
});

const baseForm = () => ({
  effect: { anchor: "fixed", shape: "line", revealSeconds: 6 },
  payload: { kind: "none", roll: { save: { statistic: "reflex" } }, hazard: {} },
  detection: { dcSource: "manual", minRank: 0 },
  trigger: { dispositions: ["friendly"] }
});

test("formToTrapUpdate writes system.challenge only when the form has the Challenge tab", () => {
  const without = formToTrapUpdate(baseForm());
  assert.equal(without.ok, true);
  assert.equal("system.challenge" in without.update, false);
  const withTab = formToTrapUpdate({ ...baseForm(), challenge: { triggers: [{ trackId: "p", when: "complete" }], effects: {} } });
  assert.equal(withTab.ok, true);
  assert.equal(withTab.update["system.challenge"].triggers.length, 1);
  const invalid = formToTrapUpdate({ ...baseForm(), challenge: { triggers: [{ trackId: "p", when: "reaches", value: "x" }] } });
  assert.equal(invalid.ok, false);
});

/* ---- defaults and migration ---- */

test("defaults carry an empty challenge, fresh each call", () => {
  const a = defaultTrapSystem();
  assert.deepEqual(a.challenge, defaultChallenge());
  assert.deepEqual(a.challenge.triggers, []);
  a.challenge.triggers.push(1);
  a.challenge.effects.fired.delta = 5;
  assert.deepEqual(defaultTrapSystem().challenge.triggers, []);
  assert.equal(defaultTrapSystem().challenge.effects.fired.delta, 0);
});

test("migration fills a missing challenge and keeps an existing one", () => {
  const old = migrateTrapSystem({ status: "armed" });
  assert.equal(old.migrated, true);
  assert.deepEqual(old.data.challenge, defaultChallenge());
  const mine = { triggers: [trig()], effects: { fired: { trackId: "p", delta: 1 } } };
  const kept = migrateTrapSystem({ ...defaultTrapSystem(), challenge: mine });
  assert.deepEqual(kept.data.challenge.triggers, mine.triggers);
  assert.deepEqual(kept.data.challenge.effects.fired, { trackId: "p", delta: 1 });
  assert.deepEqual(kept.data.challenge.effects.noticed, { trackId: null, delta: 0 }); // missing keys filled
  assert.equal(triggerCrossed(null, null, null), false);
});
