import test from "node:test";
import assert from "node:assert/strict";
import { pickTargets, degreeOfSuccess, detectionKey } from "../scripts/core/targets.js";

const a = (n, extra = {}) => ({ uuid: `Actor.${n}`, name: n, ...extra });
const t = (n, actor, extra = {}) => ({ uuid: `Scene.s.Token.${n}`, name: n, actorUuid: actor ? `Actor.${actor}` : null, ...extra });

test("pickTargets orders party, owned, tokens and unchecks by default", () => {
  const out = pickTargets({ party: [a("p1"), a("p2")], owned: [a("o1")], tokens: [t("t1")] });
  assert.deepEqual(out.map((o) => [o.name, o.kind, o.checked]), [
    ["p1", "party", false], ["p2", "party", false], ["o1", "owned", false], ["t1", "token", false]
  ]);
});

test("pickTargets prefers the token entry over its actor", () => {
  const out = pickTargets({ party: [a("p1"), a("p2")], owned: [a("p1")], tokens: [t("tok", "p1")] });
  assert.deepEqual(out.map((o) => o.uuid), ["Actor.p2", "Scene.s.Token.tok"]);
  assert.equal(out[1].actorUuid, "Actor.p1");
});

test("pickTargets dedupes repeated uuids and honours chosen", () => {
  const out = pickTargets({ party: [a("p1"), a("p1")], owned: [a("p1")], tokens: [t("x"), t("x")], chosen: ["Actor.p1"] });
  assert.equal(out.length, 2);
  assert.equal(out[0].checked, true);
  assert.equal(out[1].checked, false);
});

test("pickTargets tolerates missing lists", () => {
  assert.deepEqual(pickTargets(), []);
  assert.deepEqual(pickTargets({ party: [null, {}] }), []);
});

test("degreeOfSuccess margins", () => {
  assert.equal(degreeOfSuccess({ total: 25, dc: 15 }), 3);
  assert.equal(degreeOfSuccess({ total: 24, dc: 15 }), 2);
  assert.equal(degreeOfSuccess({ total: 15, dc: 15 }), 2);
  assert.equal(degreeOfSuccess({ total: 14, dc: 15 }), 1);
  assert.equal(degreeOfSuccess({ total: 6, dc: 15 }), 1);
  assert.equal(degreeOfSuccess({ total: 5, dc: 15 }), 0);
});

test("degreeOfSuccess natural 20 and 1 move one step and clamp", () => {
  assert.equal(degreeOfSuccess({ total: 14, dc: 15, die: 20 }), 2);
  assert.equal(degreeOfSuccess({ total: 15, dc: 15, die: 1 }), 1);
  assert.equal(degreeOfSuccess({ total: 30, dc: 15, die: 20 }), 3);
  assert.equal(degreeOfSuccess({ total: 1, dc: 15, die: 1 }), 0);
  assert.equal(degreeOfSuccess({ total: 5, dc: 15, die: 20 }), 1);
  assert.equal(degreeOfSuccess({ total: 15, dc: 15, die: 10 }), 2);
});

test("degreeOfSuccess is null without numbers", () => {
  assert.equal(degreeOfSuccess({ total: NaN, dc: 10 }), null);
  assert.equal(degreeOfSuccess({ total: 10, dc: undefined }), null);
});

test("detectionKey prefers the token uuid", () => {
  assert.equal(detectionKey({ tokenUuid: "T", actorUuid: "A" }), "T");
  assert.equal(detectionKey({ actorUuid: "A" }), "A");
  assert.equal(detectionKey({}), null);
});
