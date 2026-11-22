import test from "node:test";
import assert from "node:assert/strict";
import { buildDamageFormula, buildCheckSyntax, checkHazardLink, strikeTargets } from "../scripts/core/pf2e-text.js";
import { TrapAdapter } from "../scripts/adapters/adapter-api.js";

test("buildDamageFormula", () => {
  assert.equal(buildDamageFormula("2d6", "piercing"), "2d6[piercing]");
  assert.equal(buildDamageFormula("2d6", ""), "2d6");
  assert.equal(buildDamageFormula("2d6", undefined), "2d6");
  assert.equal(buildDamageFormula("2d6[fire]", "piercing"), "2d6[fire]");
  assert.equal(buildDamageFormula(" 1d8+2 ", " slashing "), "1d8+2[slashing]");
  assert.equal(buildDamageFormula("", "fire"), "");
});

test("buildCheckSyntax", () => {
  assert.equal(buildCheckSyntax({ statistic: "reflex", dc: 20, basic: true }), "@Check[reflex|dc:20|basic]");
  assert.equal(buildCheckSyntax({ statistic: "Will", dc: 15, basic: false }), "@Check[will|dc:15]");
  assert.equal(buildCheckSyntax({ statistic: "fortitude", dc: null, basic: true }), "@Check[fortitude|basic]");
  assert.equal(buildCheckSyntax({ statistic: "fortitude" }), "@Check[fortitude]");
  assert.equal(buildCheckSyntax({ statistic: "perception", dc: 20 }), null);
  assert.equal(buildCheckSyntax({ statistic: "" }), null);
  assert.equal(buildCheckSyntax(), null);
  assert.equal(buildCheckSyntax({ statistic: "reflex", dc: 0 }), "@Check[reflex|dc:0]");
});

test("checkHazardLink", () => {
  assert.deepEqual(checkHazardLink({ actorFound: false, itemFound: false }), { ok: false, reason: "missing-actor", kind: null });
  assert.deepEqual(checkHazardLink({ actorFound: true, itemFound: false }), { ok: false, reason: "missing-item", kind: null });
  assert.deepEqual(checkHazardLink({ actorFound: true, itemFound: true, itemType: "melee" }), { ok: true, reason: null, kind: "strike" });
  assert.deepEqual(checkHazardLink({ actorFound: true, itemFound: true, itemType: "action" }), { ok: true, reason: null, kind: "action" });
  assert.deepEqual(checkHazardLink({ actorFound: true, itemFound: true, itemType: "weapon" }), { ok: false, reason: "unsupported-item", kind: null });
});

test("strikeTargets", () => {
  assert.deepEqual(strikeTargets({ affected: ["a", "b", "a"], triggering: ["t"] }), { ids: ["a", "b"], capped: false });
  assert.deepEqual(strikeTargets({ affected: [], triggering: ["t", "t"] }), { ids: ["t"], capped: false });
  assert.deepEqual(strikeTargets({ affected: ["a"], triggering: ["t"], mode: "triggering" }), { ids: ["t"], capped: false });
  assert.deepEqual(strikeTargets({ mode: "triggering", affected: ["a"] }), { ids: [], capped: false });
  const many = Array.from({ length: 12 }, (_, i) => `x${i}`);
  const r = strikeTargets({ affected: many });
  assert.equal(r.ids.length, 10);
  assert.equal(r.capped, true);
  assert.deepEqual(strikeTargets({ affected: many, max: 12 }).capped, false);
  assert.deepEqual(strikeTargets(), { ids: [], capped: false });
});

test("base adapter validatePayload is ok", () => {
  assert.deepEqual(new TrapAdapter().validatePayload({ kind: "hazard" }), { ok: true });
});
