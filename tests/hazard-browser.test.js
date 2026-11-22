import test from "node:test";
import assert from "node:assert/strict";
import { filterHazards, sortHazards, buildHazardEntry } from "../scripts/core/hazard-browser.js";

const e = (name, o = {}) => ({
  uuid: `u.${name}`, name, img: "", level: 1, traits: [], kind: "trap", isComplex: false, stealthDC: 20,
  pack: "pf2e.hazards", packTitle: "Hazards", ...o
});
const list = [
  e("Spear Launcher", { level: 1 }),
  e("Haunted Hall", { level: 5, kind: "haunt", isComplex: true, pack: "pf2e.b" }),
  e("Avalanche", { level: 8, kind: "environmental", pack: "pf2e.b" }),
  e("Armageddon Orb", { level: 20, isComplex: true })
];
const names = (r) => r.map((x) => x.name);

test("no filters returns everything, input untouched", () => {
  const copy = structuredClone(list);
  assert.equal(filterHazards(list, {}).length, 4);
  assert.deepEqual(list, copy);
});

test("kind, level range, complexity, pack, query", () => {
  assert.deepEqual(names(filterHazards(list, { kind: "haunt" })), ["Haunted Hall"]);
  assert.deepEqual(names(filterHazards(list, { levelMin: 5, levelMax: 8 })), ["Haunted Hall", "Avalanche"]);
  assert.deepEqual(names(filterHazards(list, { levelMin: "", levelMax: "2" })), ["Spear Launcher"]);
  assert.deepEqual(names(filterHazards(list, { complexity: "complex" })), ["Haunted Hall", "Armageddon Orb"]);
  assert.deepEqual(names(filterHazards(list, { complexity: "simple" })), ["Spear Launcher", "Avalanche"]);
  assert.deepEqual(names(filterHazards(list, { pack: "pf2e.b" })), ["Haunted Hall", "Avalanche"]);
  assert.deepEqual(names(filterHazards(list, { query: "  ORB " })), ["Armageddon Orb"]);
  assert.deepEqual(names(filterHazards(list, { kind: "trap", complexity: "complex", levelMin: 10 })), ["Armageddon Orb"]);
});

test("sortHazards by level then name", () => {
  const input = [e("B", { level: 2 }), e("A", { level: 2 }), e("Z", { level: 1 })];
  assert.deepEqual(names(sortHazards(input)), ["Z", "A", "B"]);
  assert.deepEqual(names(input), ["B", "A", "Z"]);
});

test("buildHazardEntry maps an index record", () => {
  const rec = {
    _id: "x1", name: "Pit", img: "i.webp",
    system: { traits: { value: ["trap", "mechanical"] }, details: { level: { value: 3 }, isComplex: true }, attributes: { stealth: { dc: 22 } } }
  };
  const r = buildHazardEntry(rec, { collection: "pf2e.hazards", title: "Hazards" });
  assert.deepEqual(r, {
    uuid: "Compendium.pf2e.hazards.Actor.x1", name: "Pit", img: "i.webp", level: 3, traits: ["trap", "mechanical"],
    kind: "trap", isComplex: true, stealthDC: 22, pack: "pf2e.hazards", packTitle: "Hazards"
  });
  const bare = buildHazardEntry({ _id: "y", name: "Bare" }, { collection: "p" });
  assert.equal(bare.level, 0);
  assert.equal(bare.stealthDC, null);
  // Compendium index records carry the stored modifier, not a prepared dc.
  const fromIndex = buildHazardEntry({ _id: "y", name: "Pit", system: { attributes: { stealth: { value: 13, details: "" } } } }, { collection: "pf2e.hazards", title: "Hazards" });
  assert.equal(fromIndex.stealthDC, 23);
  assert.equal(bare.kind, "other");
});
