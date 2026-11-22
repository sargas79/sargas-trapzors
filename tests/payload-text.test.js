import test from "node:test";
import assert from "node:assert/strict";
import { buildSaveLine, buildRollFlavor, decideDelivery, isEmptyFlavor, buildPublicCardData, buildSummaryData, summaryHeaderKey } from "../scripts/core/payload-text.js";
import { selectAdapter } from "../scripts/adapters/registry.js";
import { TrapAdapter, UnsupportedPayloadError } from "../scripts/adapters/adapter-api.js";

test("save line capitalizes, marks basic, never has a DC", () => {
  assert.equal(buildSaveLine({ statistic: "reflex", basic: true, dc: 20 }), "Reflex save (basic)");
  assert.equal(buildSaveLine({ statistic: "will", basic: false, dc: 20 }), "Will save");
  assert.ok(!buildSaveLine({ statistic: "reflex", basic: true, dc: 20 }).includes("20"));
  assert.equal(buildSaveLine({ statistic: "", basic: true }), null);
  assert.equal(buildSaveLine(null), null);
  assert.equal(buildSaveLine({ statistic: "fort", basic: true }, { saveTemplate: "{statistic}-Wurf", basicSuffix: "(einfach)" }), "Fort-Wurf (einfach)");
});

test("roll flavor skips empty parts", () => {
  assert.equal(buildRollFlavor({ trapName: "Dart", damageType: "piercing", saveLine: "Reflex save" }), "Dart · piercing · Reflex save");
  assert.equal(buildRollFlavor({ trapName: "Dart", damageType: "", saveLine: null }), "Dart");
});

test("delivery: public vs test whisper", () => {
  assert.deepEqual(decideDelivery({ test: false }), { whisperToGMs: false, prefix: "" });
  assert.deepEqual(decideDelivery({ test: true }), { whisperToGMs: true, prefix: "[TEST] " });
});

test("isEmptyFlavor", () => {
  assert.equal(isEmptyFlavor(""), true);
  assert.equal(isEmptyFlavor(undefined), true);
  assert.equal(isEmptyFlavor("<p> &nbsp; </p>"), true);
  assert.equal(isEmptyFlavor("<p>Boom</p>"), false);
});

test("DC only in the GM summary", () => {
  const pub = buildPublicCardData({ trapName: "T", flavorHTML: "<p>x</p>", test: false });
  assert.ok(!("dc" in pub));
  const tok = (name, uuid) => ({ name, uuid });
  const s = buildSummaryData({ trapName: "T", triggering: [tok("A", "u1")], affected: [tok("B", "u2")], dc: 20, notes: ["n"], test: true });
  assert.equal(s.dc, 20);
  assert.deepEqual(s.triggeringNames, ["A"]);
  assert.deepEqual(s.affectedUuids, ["u2"]);
  assert.equal(s.prefix, "[TEST] ");
  assert.equal(buildSummaryData({ trapName: "T" }).dc, null);
});

test("selectAdapter", () => {
  const generic = { id: "generic" };
  const reg = { generic, bySystem: { pf2e: generic, sf2e: generic } };
  assert.deepEqual(selectAdapter("pf2e", reg), { adapter: generic, fallback: false, supported: true });
  assert.deepEqual(selectAdapter("sf2e", reg), { adapter: generic, fallback: false, supported: true });
  assert.deepEqual(selectAdapter("dnd5e", reg), { adapter: generic, fallback: true, supported: false });
  assert.equal(selectAdapter(undefined, reg).supported, false);
});

test("base adapter throws typed errors", async () => {
  const a = new TrapAdapter();
  await assert.rejects(a.rollPayload({}), UnsupportedPayloadError);
  await assert.rejects(a.postHazardAction({}), (e) => e.operation === "postHazardAction");
  assert.throws(() => a.getStealthDC({}), UnsupportedPayloadError);
  assert.deepEqual(a.capabilities, { roll: false, hazard: false, detection: false, browse: false });
});

test("summary header and blocked flag", () => {
  assert.equal(summaryHeaderKey({}), "SARGAS_TRAPZORS.Chat.Summary");
  assert.equal(summaryHeaderKey({ blocked: true }), "SARGAS_TRAPZORS.Chat.Blocked");
  assert.equal(buildSummaryData({ trapName: "T", blocked: true }).headerKey, "SARGAS_TRAPZORS.Chat.Blocked");
  assert.equal(buildSummaryData({ trapName: "T" }).blocked, false);
});
