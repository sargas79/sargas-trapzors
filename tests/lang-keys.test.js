import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Foundry expands flat "a.b.c" keys into nested objects. A key that is also the prefix of another key
// ("X" and "X.y") collides during expansion and drops the whole namespace, so every string shows as its key.
test("no lang key is a prefix of another key", () => {
  const keys = Object.keys(JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")));
  const collisions = keys.filter((k) => keys.some((o) => o !== k && o.startsWith(`${k}.`)));
  assert.deepEqual(collisions, []);
});
