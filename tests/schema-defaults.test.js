import test from "node:test";
import assert from "node:assert/strict";
import { migrateTrapSystem } from "../scripts/core/schema-migrate.js";
import { defaultTrapSystem } from "../scripts/core/trap-defaults.js";
import { CURRENT_SCHEMA_VERSION, STATUS, DISPOSITIONS } from "../scripts/core/constants.js";

test("defaults match plan shape and are fresh each call", () => {
  const a = defaultTrapSystem();
  const b = defaultTrapSystem();
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  a.pending.push(1);
  a.trigger.dispositions.push(0);
  a.payload.roll.save.dc = 5;
  a.detection.checked.push("x");
  assert.deepEqual(b.pending, []);
  assert.deepEqual(b.trigger.dispositions, [1]);
  assert.equal(b.payload.roll.save.dc, null);
  assert.deepEqual(b.detection.checked, []);
  assert.equal(b.schemaVersion, 3);
  assert.equal(b.rearmSeconds, null);
  assert.equal(b.status, "armed");
  assert.equal(b.trigger.actorTypes, null);
  assert.equal(b.effect.revealSeconds, 6);
});

test("constants", () => {
  assert.deepEqual({ ...STATUS }, { ARMED: "armed", PENDING: "pending", SPENT: "spent" });
  assert.deepEqual({ ...DISPOSITIONS }, { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
});

test("migration fills missing fields without overwriting", () => {
  const input = { status: "spent", trigger: { includeHidden: true }, payload: { roll: { save: { dc: 20 } } } };
  const snapshot = structuredClone(input);
  const { data, migrated } = migrateTrapSystem(input);
  assert.equal(migrated, true);
  assert.deepEqual(input, snapshot);
  assert.equal(data.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(data.status, "spent");
  assert.equal(data.trigger.includeHidden, true);
  assert.deepEqual(data.trigger.dispositions, [1]);
  assert.equal(data.payload.roll.save.dc, 20);
  assert.equal(data.payload.roll.save.statistic, "reflex");
  assert.equal(data.payload.hazard.strikeTargets, "affected");
  assert.deepEqual(data.detection.checked, []);
  assert.equal(data.effect.shape, "line");
});

test("migration preserves explicit null and false values", () => {
  const input = defaultTrapSystem();
  input.trigger.actorTypes = ["npc"];
  input.reusable = true;
  input.schemaVersion = 0;
  const { data } = migrateTrapSystem(input);
  assert.deepEqual(data.trigger.actorTypes, ["npc"]);
  assert.equal(data.reusable, true);
  assert.equal(data.schemaVersion, 3);
});

test("complete current data is not migrated", () => {
  const input = defaultTrapSystem();
  const { data, migrated } = migrateTrapSystem(input);
  assert.equal(migrated, false);
  assert.deepEqual(data, input);
});

test("newer schema version is unsupported and untouched", () => {
  const input = { schemaVersion: 99, foo: 1 };
  const r = migrateTrapSystem(input);
  assert.equal(r.migrated, false);
  assert.equal(r.unsupported, true);
  assert.equal(r.data, input);
  assert.deepEqual(input, { schemaVersion: 99, foo: 1 });
});

test("a v1 object migrates to v2 with the re-arm fields", () => {
  const v1 = defaultTrapSystem();
  delete v1.rearmSeconds;
  v1.schemaVersion = 1;
  v1.status = "spent";
  v1.lastFired = { at: 5, tokenUuids: [] };
  const { data, migrated } = migrateTrapSystem(v1);
  assert.equal(migrated, true);
  assert.equal(data.schemaVersion, 3);
  assert.equal(data.rearmSeconds, null);
  assert.equal(data.status, "spent");
  assert.deepEqual(data.lastFired, { at: 5, tokenUuids: [] });
});

test("v2 data without effect.animation gets the animation defaults", () => {
  const old = defaultTrapSystem();
  delete old.effect.animation;
  old.effect.shape = "cone";
  const { data, migrated } = migrateTrapSystem(old);
  assert.equal(migrated, true);
  assert.deepEqual(data.effect.animation, { preset: null, file: null, mode: "area", persist: false });
  assert.equal(data.effect.shape, "cone");
  assert.equal(data.schemaVersion, 3);
  const kept = defaultTrapSystem();
  kept.effect.animation.preset = "explosion";
  assert.equal(migrateTrapSystem(kept).data.effect.animation.preset, "explosion");
});

test("a v2 object migrates to v3 with only the encounter defaults added", () => {
  const v2 = defaultTrapSystem();
  delete v2.encounter;
  delete v2.payload.hazard.encounter;
  v2.schemaVersion = 2;
  v2.status = "spent";
  v2.payload.kind = "hazard";
  v2.payload.hazard.actorUuid = "Actor.abc";
  v2.payload.hazard.strikeTargets = "triggering";
  const snapshot = structuredClone(v2);
  const { data, migrated } = migrateTrapSystem(v2);
  assert.equal(migrated, true);
  assert.deepEqual(v2, snapshot);
  assert.equal(data.schemaVersion, 3);
  assert.deepEqual(data.encounter, { tokenId: null, combatId: null });
  assert.deepEqual(data.payload.hazard.encounter, { enabled: true, add: "triggering" });
  // Nothing else changed.
  const expected = structuredClone(snapshot);
  expected.schemaVersion = 3;
  expected.encounter = { tokenId: null, combatId: null };
  expected.payload.hazard.encounter = { enabled: true, add: "triggering" };
  assert.deepEqual(data, expected);
});

test("migration keeps stored encounter settings", () => {
  const input = defaultTrapSystem();
  input.payload.hazard.encounter = { enabled: false, add: "none" };
  input.encounter = { tokenId: "t1", combatId: "c1" };
  const { data, migrated } = migrateTrapSystem(input);
  assert.equal(migrated, false);
  assert.deepEqual(data.payload.hazard.encounter, { enabled: false, add: "none" });
  assert.deepEqual(data.encounter, { tokenId: "t1", combatId: "c1" });
});
