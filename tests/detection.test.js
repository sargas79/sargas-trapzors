import test from "node:test";
import assert from "node:assert/strict";
import { decideDetection, checkRequirements, resolveDetectionDC, isSuccess } from "../scripts/core/detection.js";
import { buildDetectionShape, isValidEmanationBase } from "../scripts/core/geometry.js";

const ok = { isActiveGM: true, trapExists: true, trapDisabled: false, detectionEnabled: true, status: "armed", revealed: false, eligible: true, alreadyChecked: false, isDuplicate: false };

test("decideDetection checks when valid, also when pending", () => {
  assert.deepEqual(decideDetection(ok), { action: "check", reason: "ok" });
  assert.equal(decideDetection({ ...ok, status: "pending" }).action, "check");
});

test("decideDetection ignore branches", () => {
  const cases = [
    [{ isActiveGM: false }, "not-authority"], [{ trapExists: false }, "trap-missing"],
    [{ trapDisabled: true }, "trap-disabled"], [{ detectionEnabled: false }, "detection-disabled"],
    [{ status: "spent" }, "not-armed"], [{ revealed: true }, "revealed"], [{ eligible: false }, "ineligible"],
    [{ alreadyChecked: true }, "already-checked"], [{ isDuplicate: true }, "duplicate"]
  ];
  for (const [patch, reason] of cases) assert.deepEqual(decideDetection({ ...ok, ...patch }), { action: "ignore", reason });
});

test("checkRequirements", () => {
  assert.deepEqual(checkRequirements({ requireSearch: true, isSearching: true, minRank: 0, rank: 0 }), { ok: true, reason: null });
  assert.deepEqual(checkRequirements({ requireSearch: true, isSearching: false, minRank: 0, rank: 4 }), { ok: false, reason: "not-searching" });
  assert.deepEqual(checkRequirements({ requireSearch: false, isSearching: false, minRank: 2, rank: 1 }), { ok: false, reason: "rank-too-low" });
  assert.equal(checkRequirements({ requireSearch: false, isSearching: false, minRank: 2, rank: 2 }).ok, true);
});

test("resolveDetectionDC", () => {
  assert.equal(resolveDetectionDC({ dcSource: "manual", manualDC: 22, hazardDC: 30 }), 22);
  assert.equal(resolveDetectionDC({ dcSource: "hazard", manualDC: 22, hazardDC: 30 }), 30);
  assert.equal(resolveDetectionDC({ dcSource: "hazard", manualDC: 22, hazardDC: null }), null);
  assert.equal(resolveDetectionDC({ dcSource: "manual" }), null);
  assert.equal(resolveDetectionDC({ dcSource: "manual", manualDC: 0 }), 0);
});

test("isSuccess", () => {
  assert.deepEqual([0, 1, 2, 3].map(isSuccess), [false, false, true, true]);
  assert.equal(isSuccess(null), false);
});

test("buildDetectionShape", () => {
  const b = { x: 100, y: 200, width: 300, height: 100 };
  const rect = { type: "rectangle", x: 100, y: 200, width: 300, height: 100, hole: false };
  assert.deepEqual(buildDetectionShape([rect], b, 200, true), { type: "emanation", base: rect, radius: 200, gridBased: true });
  const fb = buildDetectionShape([{ type: "emanation", base: {}, radius: 1 }], b, 200, false);
  assert.deepEqual(fb.base, { type: "rectangle", x: 100, y: 200, width: 300, height: 100 });
  assert.equal(fb.gridBased, false);
  assert.equal(buildDetectionShape([], b, 5, true).base.type, "rectangle");
  const skipHole = buildDetectionShape([{ ...rect, hole: true }, { type: "circle", x: 1, y: 2, radius: 3 }], b, 5, true);
  assert.equal(skipHole.base.type, "circle");
  assert.equal(isValidEmanationBase("ring"), false);
  assert.equal(isValidEmanationBase("polygon"), true);
});
