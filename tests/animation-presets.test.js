import test from "node:test";
import assert from "node:assert/strict";
import {
  ANIMATION_PRESETS, getPreset, presetsByGroup, fileSize, shapeBounds, computePlacement, suggestPreset
} from "../scripts/core/animation-presets.js";

test("preset list is frozen, unique, and every file carries its size", () => {
  assert.equal(ANIMATION_PRESETS.length, 17);
  assert.equal(new Set(ANIMATION_PRESETS.map((x) => x.id)).size, 17);
  assert.ok(Object.isFrozen(ANIMATION_PRESETS));
  for (const pr of ANIMATION_PRESETS) {
    assert.ok(fileSize(pr.path), pr.id);
    assert.ok(["line", "cone", "area", "haunt"].includes(pr.group));
    assert.ok(["stretch", "cone", "area"].includes(pr.mode));
    assert.equal(pr.template.length, 3);
  }
  assert.equal(getPreset("darts").mode, "stretch");
  assert.equal(getPreset("nope"), null);
  assert.deepEqual(presetsByGroup("haunt").map((x) => x.id), ["hauntSpirits", "hauntSkulls"]);
});

test("fileSize parses the WxH suffix", () => {
  assert.deepEqual(fileSize("a/b/Dart01_01_Regular_White_30ft_1600x400.webm"), { width: 1600, height: 400 });
  assert.deepEqual(fileSize("x_10x05ft_800x600.webm"), { width: 800, height: 600 });
  assert.equal(fileSize("x/plain.webm"), null);
  assert.equal(fileSize(null), null);
});

test("shapeBounds", () => {
  assert.deepEqual(shapeBounds({ type: "rectangle", x: 10, y: 20, width: 30, height: 40 }), { x: 10, y: 20, width: 30, height: 40 });
  assert.deepEqual(shapeBounds({ type: "circle", x: 100, y: 100, radius: 50 }), { x: 50, y: 50, width: 100, height: 100 });
  assert.deepEqual(shapeBounds({ type: "ellipse", x: 100, y: 100, radiusX: 50, radiusY: 20 }), { x: 50, y: 80, width: 100, height: 40 });
  assert.deepEqual(shapeBounds({ type: "polygon", points: [0, 0, 100, 10, 50, 80] }), { x: 0, y: 0, width: 100, height: 80 });
  const eman = { type: "emanation", radius: 100, base: { type: "rectangle", x: 100, y: 100, width: 100, height: 100 } };
  assert.deepEqual(shapeBounds(eman), { x: 0, y: 0, width: 300, height: 300 });
  const tok = { type: "emanation", radius: 50, base: { type: "token", x: 200, y: 200, width: 2, height: 1 } };
  assert.deepEqual(shapeBounds(tok, 100), { x: 150, y: 150, width: 300, height: 200 });
  assert.equal(shapeBounds(tok), null); // token base needs the grid size
  const line = shapeBounds({ type: "line", x: 0, y: 0, length: 100, width: 20, rotation: 0 });
  assert.deepEqual(line, { x: 0, y: -10, width: 100, height: 20 });
  assert.equal(shapeBounds({ type: "grid", offsets: [] }), null);
  assert.equal(shapeBounds(null), null);
});

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("stretch placement uses start/end points and line width", () => {
  const darts = getPreset("darts");
  const pl = computePlacement({ type: "line", x: 100, y: 200, length: 300, width: 100, rotation: 30 }, darts, 100);
  near(pl.width, 400); // scaleX 300 / (1600-200-200)
  near(pl.height, 200); // scaleY 100 / 200
  assert.equal(pl.x, 100); assert.equal(pl.y, 200); assert.equal(pl.rotation, 30);
  near(pl.anchorX, 0.125); assert.equal(pl.anchorY, 0.5);
  const jet = computePlacement({ type: "line", x: 0, y: 0, length: 600, width: 50, rotation: 0 }, getPreset("fireJet"), 100);
  near(jet.width, 600); near(jet.height, 50); assert.equal(jet.anchorX, 0);
});

test("stretch height never drops below half the horizontal scale", () => {
  const pl = computePlacement({ type: "line", x: 0, y: 0, length: 2000, width: 10, rotation: 0 }, getPreset("lightning"), 100);
  near(pl.width, 2000); // scaleX 0.5
  near(pl.height, 100); // max(0.1, 0.25) * 400
});

test("cone placement maps the file travel onto the radius", () => {
  const pl = computePlacement({ type: "cone", x: 50, y: 60, radius: 300, angle: 90, rotation: 45 }, getPreset("fireCone"), 100);
  near(pl.width, 300); near(pl.height, 300);
  assert.equal(pl.rotation, 45); assert.equal(pl.anchorX, 0); assert.equal(pl.anchorY, 0.5);
  assert.equal(pl.x, 50); assert.equal(pl.y, 60);
});

test("area placement centres on the bounds and scales the larger side", () => {
  const eman = { type: "emanation", radius: 100, base: { type: "rectangle", x: 100, y: 100, width: 100, height: 100 } };
  const pl = computePlacement(eman, getPreset("explosion"), 100);
  assert.deepEqual(pl, { x: 150, y: 150, width: 300, height: 300, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
  const rocks = computePlacement({ type: "rectangle", x: 0, y: 0, width: 300, height: 150 }, getPreset("fallingRocks"), 100);
  near(rocks.width, 300); near(rocks.height, 225); // 800x600 keeps its aspect
  assert.equal(rocks.x, 150); assert.equal(rocks.y, 75);
});

test("a shape that does not suit the mode falls back to area; unplaceable gives null", () => {
  const pl = computePlacement({ type: "rectangle", x: 0, y: 0, width: 200, height: 200 }, getPreset("fireCone"), 100);
  assert.equal(pl.anchorX, 0.5); assert.equal(pl.width, 200);
  assert.equal(computePlacement({ type: "grid" }, getPreset("explosion"), 100), null);
  assert.equal(computePlacement(null, getPreset("explosion"), 100), null);
  assert.equal(computePlacement({ type: "circle", x: 0, y: 0, radius: 10 }, { path: "x.webm", mode: "area" }, 100), null);
  const custom = computePlacement({ type: "circle", x: 0, y: 0, radius: 100 }, { path: "x.webm", mode: "area", size: { width: 100, height: 50 } }, 100);
  near(custom.width, 200); near(custom.height, 100);
});

test("suggestPreset", () => {
  assert.equal(suggestPreset({ kind: "haunt", traits: ["fire"], shape: "line" }), "hauntSpirits");
  assert.equal(suggestPreset({ kind: "haunt" }), "hauntSpirits");
  assert.equal(suggestPreset({ kind: "trap" }), null);
  assert.equal(suggestPreset({ kind: "trap", traits: ["fire"] }), null); // no effect area
  assert.equal(suggestPreset({ kind: "trap", traits: ["Fire"], shape: "line" }), "fireJet");
  assert.equal(suggestPreset({ kind: "trap", traits: ["fire"], shape: "cone" }), "fireCone");
  assert.equal(suggestPreset({ kind: "trap", traits: ["fire"], shape: "emanation" }), "fireTrap");
  assert.equal(suggestPreset({ kind: "trap", traits: ["cold"], shape: "cone" }), "frostCone");
  assert.equal(suggestPreset({ kind: "trap", traits: ["electricity"], shape: "line" }), "lightning");
  assert.equal(suggestPreset({ kind: "trap", traits: ["poison"], shape: "emanation" }), "poisonGas");
  assert.equal(suggestPreset({ kind: "trap", traits: ["acid"], shape: "line" }), "acidJet");
  assert.equal(suggestPreset({ kind: "trap", traits: [], shape: "line" }), "darts");
  assert.equal(suggestPreset({ kind: "trap", traits: [], shape: "cone" }), null);
});
