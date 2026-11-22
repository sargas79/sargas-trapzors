import test from "node:test";
import assert from "node:assert/strict";
import { formToTrapUpdate, trapToFormContext } from "../scripts/core/trap-form.js";

const base = () => ({
  name: " Pit ",
  enabled: true,
  reusable: false,
  trigger: { dispositions: ["1", null, "-1"], actorTypes: [null, null], includeHidden: false, gmMovementTriggers: true },
  effect: { anchor: "fixed", shape: "cone", revealSeconds: "6", blockedByWalls: true },
  payload: {
    kind: "roll", flavor: "<p>Boom</p>", soundPath: "  ",
    roll: { damage: " 2d6 ", damageType: "fire", save: { statistic: "reflex", dc: "", basic: true } },
    hazard: { actorUuid: "", itemId: "" }
  },
  detection: { enabled: false, dcSource: "manual", dc: "", requireSearch: true, minRank: "2" }
});
const errs = (r) => r.errors.map((e) => `${e.field}:${e.key.split(".").pop()}`);

test("happy path maps and normalises", () => {
  const r = formToTrapUpdate(base());
  assert.equal(r.ok, true);
  assert.equal(r.blockedByWalls, true);
  assert.equal(r.enabled, true);
  assert.equal(r.name, "Pit");
  assert.deepEqual(r.update["system.trigger.dispositions"], [1, -1]);
  assert.equal(r.update["system.trigger.actorTypes"], null);
  assert.equal(r.update["system.payload.soundPath"], null);
  assert.equal(r.update["system.payload.roll.damage"], "2d6");
  assert.equal(r.update["system.payload.roll.save.dc"], null);
  assert.equal(r.update["system.effect.revealSeconds"], 6);
  assert.equal(r.update["system.detection.minRank"], 2);
  assert.equal(r.update["system.payload.hazard.actorUuid"], null);
});

test("never emits runtime state or blockedByWalls", () => {
  const r = formToTrapUpdate(base());
  for (const k of Object.keys(r.update)) {
    assert.doesNotMatch(k, /status|pending|lastFired|revealed|checked|schemaVersion|regionId|blockedByWalls/);
  }
});

test("numbers", () => {
  const f = base();
  f.payload.roll.save.dc = "15";
  f.detection.dc = 20;
  let r = formToTrapUpdate(f);
  assert.equal(r.update["system.payload.roll.save.dc"], 15);
  assert.equal(r.update["system.detection.dc"], 20);
  f.payload.roll.save.dc = "1.5";
  f.detection.dc = "-3";
  f.effect.revealSeconds = "-1";
  f.detection.minRank = "5";
  r = formToTrapUpdate(f);
  assert.deepEqual(errs(r).sort(), [
    "detection.dc:DC", "detection.minRank:MinRank", "effect.revealSeconds:RevealSeconds", "payload.roll.save.dc:DC"
  ]);
  f.effect.revealSeconds = "2.5";
  f.payload.roll.save.dc = "";
  f.detection.dc = "";
  f.detection.minRank = "x";
  assert.deepEqual(errs(formToTrapUpdate(f)), ["detection.minRank:MinRank"]);
});

test("nullable strings and trimming", () => {
  const f = base();
  f.payload.kind = "hazard";
  f.payload.hazard = { actorUuid: " Actor.a ", itemId: " i1 " };
  const r = formToTrapUpdate(f);
  assert.equal(r.update["system.payload.hazard.actorUuid"], "Actor.a");
  assert.equal(r.update["system.payload.hazard.itemId"], "i1");
  f.payload.soundPath = " a.ogg ";
  assert.equal(formToTrapUpdate(f).update["system.payload.soundPath"], "a.ogg");
});

test("dispositions", () => {
  const f = base();
  f.trigger.dispositions = undefined;
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.dispositions"], []);
  f.trigger.dispositions = "0";
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.dispositions"], [0]);
  f.trigger.dispositions = ["-2", "-2", 1];
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.dispositions"], [-2, 1]);
  f.trigger.dispositions = { secret: true, hostile: false, friendly: "on" };
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.dispositions"], [-2, 1]);
  f.trigger.dispositions = ["2"];
  assert.deepEqual(errs(formToTrapUpdate(f)), ["trigger.dispositions:Disposition"]);
});

test("actorTypes", () => {
  const f = base();
  f.trigger.actorTypes = ["character", null, "npc"];
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.actorTypes"], ["character", "npc"]);
  f.trigger.actorTypes = "hazard";
  assert.deepEqual(formToTrapUpdate(f).update["system.trigger.actorTypes"], ["hazard"]);
  f.trigger.actorTypes = [];
  assert.equal(formToTrapUpdate(f).update["system.trigger.actorTypes"], null);
  delete f.trigger.actorTypes;
  assert.equal(formToTrapUpdate(f).update["system.trigger.actorTypes"], null);
});

test("enums", () => {
  const f = base();
  f.effect.anchor = "x"; f.effect.shape = "x"; f.payload.kind = "x"; f.detection.dcSource = "x"; f.payload.roll.save.statistic = "x";
  assert.deepEqual(errs(formToTrapUpdate(f)).sort(), [
    "detection.dcSource:DCSource", "effect.anchor:Anchor", "effect.shape:Shape", "payload.kind:Kind", "payload.roll.save.statistic:Statistic"
  ]);
});

test("kind restricted by ctx.allowedKinds", () => {
  const f = base();
  assert.equal(formToTrapUpdate(f, { allowedKinds: ["none", "roll"] }).ok, true);
  f.payload.kind = "hazard";
  f.payload.hazard = { actorUuid: "a", itemId: "b" };
  assert.deepEqual(errs(formToTrapUpdate(f, { allowedKinds: ["none", "roll"] })), ["payload.kind:Kind"]);
});

test("cross-field validation", () => {
  const f = base();
  f.payload.roll.damage = "  ";
  assert.deepEqual(errs(formToTrapUpdate(f)), ["payload.roll.damage:DamageRequired"]);
  f.payload.kind = "none";
  assert.equal(formToTrapUpdate(f).ok, true);
  f.payload.kind = "hazard";
  assert.deepEqual(errs(formToTrapUpdate(f)), ["payload.hazard.actorUuid:HazardActorRequired", "payload.hazard.itemId:HazardItemRequired"]);
  f.payload.kind = "none";
  f.detection.enabled = true;
  assert.deepEqual(errs(formToTrapUpdate(f)), ["detection.dc:DetectionDCRequired"]);
  f.detection.dc = "18";
  assert.equal(formToTrapUpdate(f).ok, true);
  f.detection.dc = "";
  f.detection.dcSource = "hazard";
  assert.equal(formToTrapUpdate(f).ok, true);
});

test("trapToFormContext", () => {
  const c = trapToFormContext({ trigger: { dispositions: [1, -1], actorTypes: ["npc"] } });
  assert.deepEqual(c.dispositions, { "-2": false, "-1": true, "0": false, "1": true });
  assert.deepEqual(c.actorTypes, ["npc"]);
});

test("re-arm timer", async () => {
  const { splitRearm } = await import("../scripts/core/trap-form.js");
  const f = base();
  assert.equal(formToTrapUpdate(f).update["system.rearmSeconds"], null);
  f.rearm = { value: "", unit: "hours" };
  assert.equal(formToTrapUpdate(f).update["system.rearmSeconds"], null);
  f.rearm = { value: "2", unit: "hours" };
  assert.equal(formToTrapUpdate(f).update["system.rearmSeconds"], 7200);
  f.rearm = { value: "1.5", unit: "minutes" };
  assert.equal(formToTrapUpdate(f).update["system.rearmSeconds"], 90);
  f.rearm = { value: "1", unit: "days" };
  assert.equal(formToTrapUpdate(f).update["system.rearmSeconds"], 86400);
  for (const bad of [{ value: "0", unit: "hours" }, { value: "-1", unit: "hours" }, { value: "x", unit: "hours" }, { value: "1", unit: "weeks" }]) {
    f.rearm = bad;
    assert.deepEqual(errs(formToTrapUpdate(f)), ["rearm.value:Rearm"]);
  }
  assert.deepEqual(splitRearm(null), { value: "", unit: "minutes" });
  assert.deepEqual(splitRearm(86400), { value: 1, unit: "days" });
  assert.deepEqual(splitRearm(7200), { value: 2, unit: "hours" });
  assert.deepEqual(splitRearm(90), { value: 90, unit: "seconds" });
  assert.deepEqual(splitRearm(600), { value: 10, unit: "minutes" });
});
