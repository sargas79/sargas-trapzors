import test from "node:test";
import assert from "node:assert/strict";
import { linkStatus, planRepair, findOrphans } from "../scripts/core/links.js";

test("linkStatus", () => {
  assert.equal(linkStatus({ linkedId: null, regionExists: false, flagsMatch: false }), "none");
  assert.equal(linkStatus({ linkedId: undefined, regionExists: true, flagsMatch: true }), "none");
  assert.equal(linkStatus({ linkedId: "a", regionExists: false, flagsMatch: false }), "missing");
  assert.equal(linkStatus({ linkedId: "a", regionExists: true, flagsMatch: false }), "foreign");
  assert.equal(linkStatus({ linkedId: "a", regionExists: true, flagsMatch: true }), "ok");
});

test("planRepair", () => {
  assert.deepEqual(planRepair("ok", "x"), { action: "keep" });
  assert.deepEqual(planRepair("none", "x"), { action: "keep" });
  assert.deepEqual(planRepair("missing", "x"), { action: "relink", regionId: "x" });
  assert.deepEqual(planRepair("foreign", "x"), { action: "relink", regionId: "x" });
  assert.deepEqual(planRepair("missing", null), { action: "clear", regionId: null });
  assert.deepEqual(planRepair("foreign", undefined), { action: "clear", regionId: null });
});

test("findOrphans", () => {
  const linked = [{ id: "r1", trapBehaviorId: "b1" }, { id: "r2", trapBehaviorId: "gone" }, { id: "r3", trapBehaviorId: undefined }];
  assert.deepEqual(findOrphans(linked, ["b1", "b2"]), ["r2", "r3"]);
  assert.deepEqual(findOrphans([], ["b1"]), []);
  assert.deepEqual(findOrphans(linked, new Set(["b1", "gone"])), ["r3"]);
});

import { parseTrapRef, resolveTrapRef } from "../scripts/core/links.js";

test("parseTrapRef takes the last Region and RegionBehavior ids", () => {
  assert.deepEqual(parseTrapRef("Scene.S1.Region.R1.RegionBehavior.B1"), { trapRegionId: "R1", trapBehaviorId: "B1" });
  assert.deepEqual(parseTrapRef("Scene.S2.Region.R1.RegionBehavior.B1"), { trapRegionId: "R1", trapBehaviorId: "B1" });
  assert.equal(parseTrapRef(null), null);
  assert.equal(parseTrapRef(""), null);
  assert.equal(parseTrapRef("Actor.abc"), null);
  assert.equal(parseTrapRef("Scene.S1.Region.R1"), null);
});

test("resolveTrapRef prefers flags, falls back to uuid", () => {
  const f = { trapRegionId: "FR", trapBehaviorId: "FB" };
  assert.deepEqual(resolveTrapRef(f, "Scene.S.Region.R.RegionBehavior.B"), { trapRegionId: "FR", trapBehaviorId: "FB" });
  assert.deepEqual(resolveTrapRef({}, "Scene.S.Region.R.RegionBehavior.B"), { trapRegionId: "R", trapBehaviorId: "B" });
  assert.deepEqual(resolveTrapRef({ trapRegionId: "FR" }, "Scene.S.Region.R.RegionBehavior.B"), { trapRegionId: "R", trapBehaviorId: "B" });
  assert.equal(resolveTrapRef(undefined, undefined), null);
});
