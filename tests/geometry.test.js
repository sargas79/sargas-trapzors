import test from "node:test";
import assert from "node:assert/strict";
import { unitsToPixels, defaultEffectShape, anchorShapeToToken, tokenCenter, rectsOverlap } from "../scripts/core/geometry.js";

const sq = { type: 1, size: 100, distance: 5 };
const gl = { type: 0, size: 100, distance: 5 };
const o = { x: 500, y: 300 };

test("unitsToPixels", () => {
  assert.equal(unitsToPixels(30, sq), 600);
  assert.equal(unitsToPixels(5, { size: 50, distance: 10 }), 25);
});

test("default line", () => {
  assert.deepEqual(defaultEffectShape("line", o, sq), { type: "line", x: 500, y: 300, length: 600, width: 100, rotation: 0, gridBased: true });
  assert.equal(defaultEffectShape("line", o, gl).gridBased, false);
});

test("default cone", () => {
  assert.deepEqual(defaultEffectShape("cone", o, sq), { type: "cone", x: 500, y: 300, radius: 300, angle: 90, rotation: 0, curvature: "round", gridBased: true });
  assert.equal(defaultEffectShape("cone", o, gl).gridBased, false);
});

test("default emanation gridded uses one-square rectangle base", () => {
  assert.deepEqual(defaultEffectShape("emanation", o, sq), {
    type: "emanation", base: { type: "rectangle", x: 450, y: 250, width: 100, height: 100 }, radius: 200, gridBased: true
  });
});
test("default emanation gridless uses 1px circle base", () => {
  assert.deepEqual(defaultEffectShape("emanation", o, gl), {
    type: "emanation", base: { type: "circle", x: 500, y: 300, radius: 1 }, radius: 200, gridBased: false
  });
});
test("unknown kind throws", () => assert.throws(() => defaultEffectShape("ring", o, sq)));

const token = { x: 200, y: 400, width: 2, height: 2, shape: 0, gridSize: 100 };
test("tokenCenter", () => {
  assert.deepEqual(tokenCenter(token), { x: 300, y: 500 });
  assert.deepEqual(tokenCenter({ ...token, center: { x: 1, y: 2 } }), { x: 1, y: 2 });
});

test("anchor line/cone moves to token center and keeps rotation", () => {
  const line = { ...defaultEffectShape("line", o, sq), rotation: 45 };
  const a = anchorShapeToToken(line, token);
  assert.equal(a.x, 300); assert.equal(a.y, 500); assert.equal(a.rotation, 45);
  assert.equal(line.x, 500, "input not mutated");
  const cone = { ...defaultEffectShape("cone", o, sq), rotation: 90 };
  const c = anchorShapeToToken(cone, token);
  assert.deepEqual([c.x, c.y, c.rotation], [300, 500, 90]);
});

test("anchor emanation uses token base", () => {
  const e = anchorShapeToToken(defaultEffectShape("emanation", o, sq), token);
  assert.deepEqual(e.base, { type: "token", x: 200, y: 400, width: 2, height: 2, shape: 0 });
  assert.equal(e.radius, 200);
});

test("rectsOverlap", () => {
  const r = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(rectsOverlap(r, { x: 50, y: 50, width: 100, height: 100 }), true);
  assert.equal(rectsOverlap(r, { x: 100, y: 0, width: 10, height: 10 }), false);
});
