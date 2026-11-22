import test from "node:test";
import assert from "node:assert/strict";
import { chooseConstraintLevel } from "../scripts/core/levels.js";

const levels = [
  { id: "ground", elevation: 0 },
  { id: "upper", elevation: 10 },
  { id: "cellar", elevation: -10 }
];

test("no levels: null", () => {
  assert.equal(chooseConstraintLevel({ anchor: "fixed", levels: [] }), null);
});

test("single-level scene always picks that level", () => {
  const one = [{ id: "L1", elevation: 0 }];
  for (const anchor of ["fixed", "token"]) {
    assert.equal(chooseConstraintLevel({ anchor, tokenLevel: "L1", regionLevels: ["L1"], levels: one }), "L1");
    assert.equal(chooseConstraintLevel({ anchor, tokenLevel: null, regionLevels: [], levels: one }), "L1");
    assert.equal(chooseConstraintLevel({ anchor, tokenLevel: "gone", regionLevels: ["gone"], levels: one }), "L1");
  }
});

test("token-anchored effect uses the token's level, whatever the region's levels", () => {
  assert.equal(chooseConstraintLevel({ anchor: "token", tokenLevel: "upper", regionLevels: ["ground"], levels }), "upper");
  assert.equal(chooseConstraintLevel({ anchor: "token", tokenLevel: "upper", regionLevels: [], levels }), "upper");
});

test("fixed effect: the region level that holds the token", () => {
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: "upper", regionLevels: ["ground", "upper"], levels }), "upper");
});

test("fixed effect: token level not in the region -> the region's lowest level by elevation", () => {
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: "cellar", regionLevels: ["upper", "ground"], levels: levels.slice(0, 2) }), "ground");
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: null, regionLevels: ["upper", "ground"], levels }), "ground");
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: "ground", regionLevels: ["upper", "cellar"], levels }), "cellar");
});

test("fixed effect: elevation ties keep scene order", () => {
  const tie = [{ id: "a", elevation: 0 }, { id: "b", elevation: 0 }];
  assert.equal(chooseConstraintLevel({ anchor: "fixed", regionLevels: ["b", "a"], levels: tie }), "a");
});

test("region in every level: the token's level, else the scene's first", () => {
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: "upper", regionLevels: [], levels }), "upper");
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: null, regionLevels: [], levels }), "ground");
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: "nope", regionLevels: [], levels }), "ground");
});

test("token-anchored without a usable token falls back to the fixed rule", () => {
  assert.equal(chooseConstraintLevel({ anchor: "token", tokenLevel: null, regionLevels: ["upper", "ground"], levels }), "ground");
});

test("unknown region level ids are ignored", () => {
  assert.equal(chooseConstraintLevel({ anchor: "fixed", tokenLevel: null, regionLevels: ["ghost", "upper"], levels }), "upper");
});
