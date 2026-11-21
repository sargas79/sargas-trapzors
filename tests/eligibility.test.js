import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEligibility } from "../scripts/core/eligibility.js";
import { defaultTrapSystem } from "../scripts/core/trap-defaults.js";
import { DISPOSITIONS } from "../scripts/core/constants.js";

const rules = () => defaultTrapSystem().trigger;
const tok = (o = {}) => ({ hasActor: true, hidden: false, disposition: DISPOSITIONS.FRIENDLY, actorType: "character", ...o });
const ctx = (o = {}) => ({ moverIsGM: false, gmMovementTriggers: false, ...o });

test("happy path", () => {
  assert.deepEqual(evaluateEligibility(tok(), rules(), ctx()), { eligible: true, reason: null });
});

test("no-actor", () => {
  assert.deepEqual(evaluateEligibility(tok({ hasActor: false }), rules(), ctx()), { eligible: false, reason: "no-actor" });
});

test("gm-movement, and allowed when gmMovementTriggers", () => {
  assert.equal(evaluateEligibility(tok(), rules(), ctx({ moverIsGM: true })).reason, "gm-movement");
  assert.equal(evaluateEligibility(tok(), rules(), ctx({ moverIsGM: true, gmMovementTriggers: true })).eligible, true);
});

test("hidden, and allowed when includeHidden", () => {
  assert.equal(evaluateEligibility(tok({ hidden: true }), rules(), ctx()).reason, "hidden");
  assert.equal(evaluateEligibility(tok({ hidden: true }), { ...rules(), includeHidden: true }, ctx()).eligible, true);
});

test("disposition", () => {
  assert.equal(evaluateEligibility(tok({ disposition: DISPOSITIONS.HOSTILE }), rules(), ctx()).reason, "disposition");
  const r = { ...rules(), dispositions: [DISPOSITIONS.HOSTILE, DISPOSITIONS.NEUTRAL] };
  assert.equal(evaluateEligibility(tok({ disposition: DISPOSITIONS.HOSTILE }), r, ctx()).eligible, true);
});

test("actor-type, null means any", () => {
  const r = { ...rules(), actorTypes: ["character", "npc"] };
  assert.equal(evaluateEligibility(tok({ actorType: "hazard" }), r, ctx()).reason, "actor-type");
  assert.equal(evaluateEligibility(tok({ actorType: "npc" }), r, ctx()).eligible, true);
  assert.equal(evaluateEligibility(tok({ actorType: "anything" }), rules(), ctx()).eligible, true);
});

test("check order: no-actor > gm-movement > hidden > disposition > actor-type", () => {
  const bad = tok({ hasActor: false, hidden: true, disposition: -1, actorType: "x" });
  const r = { ...rules(), actorTypes: ["character"] };
  assert.equal(evaluateEligibility(bad, r, ctx({ moverIsGM: true })).reason, "no-actor");
  assert.equal(evaluateEligibility({ ...bad, hasActor: true }, r, ctx({ moverIsGM: true })).reason, "gm-movement");
  assert.equal(evaluateEligibility({ ...bad, hasActor: true }, r, ctx()).reason, "hidden");
  assert.equal(evaluateEligibility({ ...bad, hasActor: true, hidden: false }, r, ctx()).reason, "disposition");
  assert.equal(evaluateEligibility({ ...bad, hasActor: true, hidden: false, disposition: 1 }, r, ctx()).reason, "actor-type");
});
