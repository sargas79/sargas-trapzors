import test from "node:test";
import assert from "node:assert/strict";
import { GLOW_PRESETS, getGlow, glowPlacement, isDatabasePath, centerPlacement } from "../scripts/core/animation-presets.js";
import { formToTrapUpdate } from "../scripts/core/trap-form.js";
import { migrateTrapSystem } from "../scripts/core/schema-migrate.js";
import { defaultTrapSystem } from "../scripts/core/trap-defaults.js";
import { CURRENT_SCHEMA_VERSION } from "../scripts/core/constants.js";

test("glow presets: unique ids, lang labels, divination pulse has an explicit size", () => {
  assert.deepEqual(GLOW_PRESETS.map((g) => g.id), ["detectBlue", "detectGreen", "detectPurple", "detectYellow", "detectRed", "divinationPulse"]);
  for (const g of GLOW_PRESETS) {
    assert.equal(g.labelKey, `SARGAS_TRAPZORS.Glow.Preset.${g.id}`);
    assert.match(g.path, /\.webm$/);
    assert.ok(g.size.width > 0 && g.size.height > 0);
  }
  assert.deepEqual({ ...getGlow("divinationPulse").size }, { width: 500, height: 500 });
  assert.equal(getGlow("detectRed").path, "1st_Level/Detect_Magic/DetectMagicCircle_01_Dark_Red_1200x1200.webm");
  assert.equal(getGlow(null), null);
  assert.equal(getGlow("nope"), null);
});

test("glowPlacement centres on the bounds and matches the larger side", () => {
  const r = glowPlacement("detectBlue", { x: 100, y: 200, width: 300, height: 100 });
  assert.equal(r.src, getGlow("detectBlue").path);
  assert.deepEqual(r.placement, { x: 250, y: 250, width: 300, height: 300, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
  const pulse = glowPlacement("divinationPulse", { x: 0, y: 0, width: 200, height: 200 });
  assert.equal(pulse.placement.width, 200);
  assert.equal(glowPlacement("nope", { x: 0, y: 0, width: 1, height: 1 }), null);
  assert.equal(glowPlacement("detectBlue", { x: 0, y: 0, width: 0, height: 0 }), null);
  assert.equal(glowPlacement("detectBlue", null), null);
});

test("isDatabasePath: no slash and no media extension", () => {
  assert.equal(isDatabasePath("jb2a.spike_trap.10x10ft.brown"), true);
  assert.equal(isDatabasePath("modules/jb2a_patreon/Library/x.webm"), false);
  assert.equal(isDatabasePath("worlds/w/boom.webm"), false);
  assert.equal(isDatabasePath("boom.webm"), false);
  assert.equal(isDatabasePath(""), false);
  assert.equal(isDatabasePath(null), false);
});

test("centerPlacement: centre anchored placements are unchanged", () => {
  const c = centerPlacement({ x: 10, y: 20, width: 40, height: 30, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
  assert.deepEqual(c, { x: 10, y: 20, width: 40, height: 30, rotation: 0 });
});

test("centerPlacement: a sprite anchored at its start moves its centre along the rotation", () => {
  const c = centerPlacement({ x: 100, y: 100, width: 200, height: 50, rotation: 0, anchorX: 0, anchorY: 0.5 });
  assert.equal(c.x, 200);
  assert.equal(c.y, 100);
  const down = centerPlacement({ x: 100, y: 100, width: 200, height: 50, rotation: 90, anchorX: 0, anchorY: 0.5 });
  assert.ok(Math.abs(down.x - 100) < 1e-9);
  assert.ok(Math.abs(down.y - 200) < 1e-9);
  assert.equal(down.rotation, 90);
  const padded = centerPlacement({ x: 0, y: 0, width: 400, height: 100, rotation: 0, anchorX: 0.25, anchorY: 0.5 });
  assert.equal(padded.x, 100);
});

const form = () => ({
  name: "Pit", enabled: true, reusable: false,
  trigger: { dispositions: ["1"], actorTypes: [], includeHidden: false, gmMovementTriggers: false },
  effect: { anchor: "fixed", shape: "cone", revealSeconds: "6", blockedByWalls: false },
  payload: {
    kind: "none", flavor: "", soundPath: "",
    roll: { damage: "", damageType: "", save: { statistic: "reflex", dc: "", basic: true } },
    hazard: { actorUuid: "", itemId: "" }
  },
  detection: { enabled: false, dcSource: "manual", dc: "", requireSearch: true, minRank: "0" }
});

test("form: persist and revealGlow", () => {
  const f = form();
  let r = formToTrapUpdate(f);
  assert.equal(r.update["system.effect.animation.persist"], false);
  assert.equal(r.update["system.detection.revealGlow"], null);

  f.effect.animation = { preset: "spikes", mode: "area", persist: true };
  f.detection.revealGlow = "detectBlue";
  r = formToTrapUpdate(f);
  assert.equal(r.ok, true);
  assert.equal(r.update["system.effect.animation.persist"], true);
  assert.equal(r.update["system.detection.revealGlow"], "detectBlue");

  f.detection.revealGlow = "";
  assert.equal(formToTrapUpdate(f).update["system.detection.revealGlow"], null);

  f.detection.revealGlow = "sparkles";
  r = formToTrapUpdate(f);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.field), ["detection.revealGlow"]);
});

test("form: a JB2A database path is kept as the custom file", () => {
  const f = form();
  f.effect.animation = { preset: "custom", file: "jb2a.spike_trap.10x10ft.brown", mode: "area" };
  const r = formToTrapUpdate(f);
  assert.equal(r.update["system.effect.animation.file"], "jb2a.spike_trap.10x10ft.brown");
  assert.equal(r.update["system.effect.animation.preset"], null);
});

test("defaults: persist and glow are off; older traps are filled in without a schema bump", () => {
  const d = defaultTrapSystem();
  assert.equal(d.effect.animation.persist, false);
  assert.equal(d.detection.revealGlow, null);
  const old = defaultTrapSystem();
  delete old.effect.animation.persist;
  delete old.detection.revealGlow;
  old.effect.animation.preset = "spikes";
  const { data, migrated } = migrateTrapSystem(old);
  assert.equal(migrated, true);
  assert.equal(data.effect.animation.persist, false);
  assert.equal(data.detection.revealGlow, null);
  assert.equal(data.effect.animation.preset, "spikes");
  assert.equal(data.schemaVersion, CURRENT_SCHEMA_VERSION);
});
