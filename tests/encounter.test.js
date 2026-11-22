import test from "node:test";
import assert from "node:assert/strict";
import { encounterCreatures, routineTargets, ENCOUNTER_ADD_MODES } from "../scripts/core/encounter.js";

test("encounter add modes", () => {
  assert.deepEqual([...ENCOUNTER_ADD_MODES], ["triggering", "affected", "none"]);
});

test("encounterCreatures picks the chosen group", () => {
  const p = { affected: ["a", "b"], triggering: ["t1"] };
  assert.deepEqual(encounterCreatures({ ...p, mode: "triggering" }), ["t1"]);
  assert.deepEqual(encounterCreatures({ ...p, mode: "affected" }), ["a", "b"]);
  assert.deepEqual(encounterCreatures({ ...p, mode: "none" }), []);
  assert.deepEqual(encounterCreatures(p), ["t1"], "defaults to the triggering creatures");
});

test("encounterCreatures skips tokens already in the combat and dedupes", () => {
  assert.deepEqual(
    encounterCreatures({ mode: "affected", affected: ["a", "b", "a", "c"], existing: ["b"] }),
    ["a", "c"]
  );
  assert.deepEqual(encounterCreatures({ mode: "triggering", triggering: ["t", "t"], existing: ["t"] }), []);
});

test("encounterCreatures ignores junk and missing lists", () => {
  assert.deepEqual(encounterCreatures({ mode: "affected", affected: ["a", "", null, 5, undefined] }), ["a"]);
  assert.deepEqual(encounterCreatures({ mode: "affected" }), []);
  assert.deepEqual(encounterCreatures(), []);
});

test("routineTargets prefers targeted, then affected, then the trigger region", () => {
  assert.deepEqual(routineTargets({ targeted: ["x"], affected: ["a"], inTrigger: ["t"] }), { ids: ["x"], source: "targeted" });
  assert.deepEqual(routineTargets({ targeted: [], affected: ["a", "a", "b"], inTrigger: ["t"] }), { ids: ["a", "b"], source: "affected" });
  assert.deepEqual(routineTargets({ affected: [], inTrigger: ["t", "u"] }), { ids: ["t", "u"], source: "trigger" });
  assert.deepEqual(routineTargets({}), { ids: [], source: "none" });
  assert.deepEqual(routineTargets(), { ids: [], source: "none" });
});
