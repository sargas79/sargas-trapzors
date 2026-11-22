import test from "node:test";
import assert from "node:assert/strict";
import { translateShape } from "../scripts/core/geometry.js";

const G = 100;
for (const type of ["rectangle", "circle", "ellipse", "cone", "line", "ring", "token"]) {
  test(`translate ${type}`, () => {
    const s = { type, x: 10, y: 20, hole: false };
    assert.deepEqual(translateShape(s, 100, 50, G), { type, x: 110, y: 70, hole: false });
    assert.equal(s.x, 10);
  });
}

test("translate polygon points and origin", () => {
  const s = { type: "polygon", points: [0, 0, 10, 0, 10, 10], origin: { x: 5, y: 5 } };
  assert.deepEqual(translateShape(s, 100, 200, G), { type: "polygon", points: [100, 200, 110, 200, 110, 210], origin: { x: 105, y: 205 } });
  assert.deepEqual(translateShape({ type: "polygon", points: [0, 0, 1, 1], origin: null }, 1, 2, G).origin, null);
  assert.equal(translateShape({ type: "polygon", points: [0, 0, 1, 1] }, 1, 2, G).origin, undefined);
});

test("translate emanation translates base recursively", () => {
  const s = { type: "emanation", radius: 200, base: { type: "rectangle", x: 0, y: 0, width: 100, height: 100 } };
  const t = translateShape(s, 100, 100, G);
  assert.deepEqual(t.base, { type: "rectangle", x: 100, y: 100, width: 100, height: 100 });
  assert.equal(t.radius, 200);
  const poly = translateShape({ type: "emanation", base: { type: "polygon", points: [0, 0, 5, 5] } }, 10, 20, G);
  assert.deepEqual(poly.base.points, [10, 20, 15, 25]);
});

test("translate grid offsets by whole cells and origin by pixels", () => {
  const s = { type: "grid", offsets: [{ i: 1, j: 2 }, { i: 3, j: 4 }], origin: { x: 250, y: 150 } };
  const t = translateShape(s, 100, 200, G);
  assert.deepEqual(t.offsets, [{ i: 3, j: 3 }, { i: 5, j: 5 }]);
  assert.deepEqual(t.origin, { x: 350, y: 350 });
  assert.deepEqual(translateShape({ type: "grid", offsets: [{ i: 0, j: 0 }] }, -100, 0, G).offsets, [{ i: 0, j: -1 }]);
  assert.equal(translateShape({ type: "grid", offsets: [{ i: 0, j: 0 }] }, 49, 0, G).offsets[0].j, 0);
});

test("unknown type is unchanged", () => {
  const s = { type: "weird", x: 1, y: 2 };
  assert.deepEqual(translateShape(s, 10, 10, G), s);
});
