import test from "node:test";
import assert from "node:assert/strict";
import { rootMovementId } from "../scripts/core/movement.js";

test("rootMovementId uses chain[0] when a chain exists", () => {
  assert.equal(rootMovementId({ id: "c", chain: ["a", "b"] }), "a");
});
test("rootMovementId falls back to id without chain or with empty chain", () => {
  assert.equal(rootMovementId({ id: "c" }), "c");
  assert.equal(rootMovementId({ id: "c", chain: [] }), "c");
});
test("rootMovementId returns null for missing movement or id", () => {
  assert.equal(rootMovementId(null), null);
  assert.equal(rootMovementId(undefined), null);
  assert.equal(rootMovementId({}), null);
});
