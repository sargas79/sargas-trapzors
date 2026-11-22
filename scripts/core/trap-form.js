// Pure form <-> trap system mapping (no Foundry globals). Unit-tested in tests/trap-form.test.js.
import { DISPOSITIONS } from "./constants.js";
import { getPreset, ANIMATION_MODES } from "./animation-presets.js";
import { STRIKE_TARGET_MODES } from "./pf2e-text.js";
import { ENCOUNTER_ADD_MODES } from "./encounter.js";

export const ALLOWED_DISPOSITIONS = Object.freeze([-2, -1, 0, 1]);
export const ANCHORS = Object.freeze(["fixed", "token"]);
export const SHAPES = Object.freeze(["line", "cone", "emanation"]);
export const KINDS = Object.freeze(["none", "roll", "hazard"]);
export const DC_SOURCES = Object.freeze(["manual", "hazard"]);
export const SAVE_STATS = Object.freeze(["fortitude", "reflex", "will"]);
export const REARM_UNITS = Object.freeze({ seconds: 1, minutes: 60, hours: 3600, days: 86400 });

/** Split stored re-arm seconds into the largest unit that divides evenly. @returns {{value:number|"", unit:string}} */
export function splitRearm(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return { value: "", unit: "minutes" };
  for (const unit of ["days", "hours", "minutes"]) {
    if (seconds % REARM_UNITS[unit] === 0) return { value: seconds / REARM_UNITS[unit], unit };
  }
  return { value: seconds, unit: "seconds" };
}

const K = "SARGAS_TRAPZORS.Form.Error.";
const DISPOSITION_NAMES = Object.freeze({
  secret: DISPOSITIONS.SECRET, hostile: DISPOSITIONS.HOSTILE, neutral: DISPOSITIONS.NEUTRAL, friendly: DISPOSITIONS.FRIENDLY
});

const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
const asString = (v) => (v === undefined || v === null ? "" : String(v));
const bool = (v) => v === true || v === "true" || v === "on";

/** Normalise a checkbox group value (array with nulls, single string, or name->bool map) into a clean array. */
function toList(v) {
  if (v === undefined || v === null || v === false) return [];
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  if (typeof v === "object") return Object.entries(v).filter(([, on]) => bool(on)).map(([k]) => k);
  return [v];
}

/** Parse a base-10 integer from a number or numeric string; null when not a clean integer. */
function parseInteger(v) {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  const s = asString(v).trim();
  return /^[+-]?\d+$/.test(s) ? Number.parseInt(s, 10) : null;
}

/** Parse a finite number from a number or numeric string; null otherwise. */
function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = asString(v).trim();
  if (s === "" || !Number.isFinite(Number(s))) return null;
  return Number(s);
}

const nullableString = (v) => {
  const s = asString(v).trim();
  return s === "" ? null : s;
};

/**
 * Map an expanded form object to a flat `system.*` update for the trap behavior.
 * Runtime state (status, pending, lastFired, revealed, checked, schemaVersion, region ids) is never emitted.
 * `blockedByWalls`, `enabled` and `name` are returned separately because the sheet applies them differently.
 *
 * @param {object} formData  Expanded form values as an HTML form yields them.
 * @param {{allowedKinds?:string[]}} [ctx]  Optionally restrict payload kinds (adapter capabilities).
 * @returns {{ok:true, update:object, blockedByWalls:boolean, enabled:boolean, name:string|null}
 *   |{ok:false, errors:{field:string, key:string}[]}}
 */
export function formToTrapUpdate(formData, ctx = {}) {
  const f = formData ?? {};
  const effect = f.effect ?? {};
  const payload = f.payload ?? {};
  const roll = payload.roll ?? {};
  const save = roll.save ?? {};
  const hazard = payload.hazard ?? {};
  const trigger = f.trigger ?? {};
  const detection = f.detection ?? {};
  const rearm = f.rearm ?? {};
  const errors = [];
  const err = (field, key) => errors.push({ field, key: `${K}${key}` });
  const allowedKinds = ctx.allowedKinds ?? KINDS;

  // Effect
  const anchor = asString(effect.anchor);
  if (!ANCHORS.includes(anchor)) err("effect.anchor", "Anchor");
  const shape = asString(effect.shape);
  if (!SHAPES.includes(shape)) err("effect.shape", "Shape");
  const revealSeconds = parseNumber(effect.revealSeconds);
  if (revealSeconds === null || revealSeconds < 0) err("effect.revealSeconds", "RevealSeconds");
  // Animation: "custom" is the sheet's marker for a custom file; blank and custom both store no preset.
  const anim = effect.animation ?? {};
  const rawPreset = asString(anim.preset).trim();
  let animPreset = null;
  if (rawPreset !== "" && rawPreset !== "custom") {
    if (getPreset(rawPreset)) animPreset = rawPreset;
    else err("effect.animation.preset", "AnimationPreset");
  }
  const animMode = isBlank(anim.mode) ? "area" : asString(anim.mode).trim();
  if (!ANIMATION_MODES.includes(animMode)) err("effect.animation.mode", "AnimationMode");
  const animFile = rawPreset === "custom" ? nullableString(anim.file) : null;

  // Payload
  const kind = asString(payload.kind);
  if (!KINDS.includes(kind) || !allowedKinds.includes(kind)) err("payload.kind", "Kind");
  const damage = asString(roll.damage).trim();
  const statistic = asString(save.statistic);
  if (!SAVE_STATS.includes(statistic)) err("payload.roll.save.statistic", "Statistic");
  let saveDc = null;
  if (!isBlank(save.dc)) {
    saveDc = parseInteger(save.dc);
    if (saveDc === null || saveDc < 0) { err("payload.roll.save.dc", "DC"); saveDc = null; }
  }
  const actorUuid = nullableString(hazard.actorUuid);
  const itemId = nullableString(hazard.itemId);
  if (kind === "roll" && !damage) err("payload.roll.damage", "DamageRequired");
  const strikeTargets = isBlank(hazard.strikeTargets) ? "affected" : asString(hazard.strikeTargets).trim();
  if (!STRIKE_TARGET_MODES.includes(strikeTargets)) err("payload.hazard.strikeTargets", "StrikeTargets");
  // The Encounter group is only on the sheet for complex hazards: without its select, leave both settings alone.
  const encounter = hazard.encounter ?? {};
  const hasEncounter = !isBlank(encounter.add);
  const encounterAdd = hasEncounter ? asString(encounter.add).trim() : "triggering";
  if (!ENCOUNTER_ADD_MODES.includes(encounterAdd)) err("payload.hazard.encounter.add", "EncounterAdd");
  if (kind === "hazard") {
    if (!actorUuid) err("payload.hazard.actorUuid", "HazardActorRequired");
    if (!itemId) err("payload.hazard.itemId", "HazardItemRequired");
  }

  // Trigger
  const dispositions = [];
  for (const raw of toList(trigger.dispositions)) {
    const n = Object.hasOwn(DISPOSITION_NAMES, raw) ? DISPOSITION_NAMES[raw] : parseInteger(raw);
    if (n === null || !ALLOWED_DISPOSITIONS.includes(n)) { err("trigger.dispositions", "Disposition"); break; }
    if (!dispositions.includes(n)) dispositions.push(n);
  }
  const types = [...new Set(toList(trigger.actorTypes).map(String))];

  // Detection
  const dcSource = asString(detection.dcSource);
  if (!DC_SOURCES.includes(dcSource)) err("detection.dcSource", "DCSource");
  let detDc = null;
  if (!isBlank(detection.dc)) {
    detDc = parseInteger(detection.dc);
    if (detDc === null || detDc < 0) { err("detection.dc", "DC"); detDc = null; }
  }
  const detEnabled = bool(detection.enabled);
  if (detEnabled && dcSource === "manual" && isBlank(detection.dc)) err("detection.dc", "DetectionDCRequired");
  const minRank = parseInteger(detection.minRank);
  if (minRank === null || minRank < 0 || minRank > 4) err("detection.minRank", "MinRank");

  // Re-arm timer (game time); blank means never.
  let rearmSeconds = null;
  if (!isBlank(rearm.value)) {
    const n = parseNumber(rearm.value);
    const unit = asString(rearm.unit || "seconds");
    if (n === null || n <= 0 || !Object.hasOwn(REARM_UNITS, unit)) err("rearm.value", "Rearm");
    else rearmSeconds = Math.round(n * REARM_UNITS[unit]);
  }

  if (errors.length) return { ok: false, errors };

  const update = {
    "system.reusable": bool(f.reusable),
    "system.rearmSeconds": rearmSeconds,
    "system.trigger.dispositions": dispositions,
    "system.trigger.actorTypes": types.length ? types : null,
    "system.trigger.includeHidden": bool(trigger.includeHidden),
    "system.trigger.gmMovementTriggers": bool(trigger.gmMovementTriggers),
    "system.effect.anchor": anchor,
    "system.effect.shape": shape,
    "system.effect.revealSeconds": revealSeconds,
    "system.effect.animation.preset": animPreset,
    "system.effect.animation.file": animFile,
    "system.effect.animation.mode": animMode,
    "system.payload.kind": kind,
    "system.payload.flavor": asString(payload.flavor),
    "system.payload.soundPath": nullableString(payload.soundPath),
    "system.payload.roll.damage": damage,
    "system.payload.roll.damageType": asString(roll.damageType).trim(),
    "system.payload.roll.save.statistic": statistic,
    "system.payload.roll.save.dc": saveDc,
    "system.payload.roll.save.basic": bool(save.basic),
    "system.payload.hazard.actorUuid": actorUuid,
    "system.payload.hazard.itemId": itemId,
    "system.payload.hazard.strikeTargets": strikeTargets,
    ...(hasEncounter ? {
      "system.payload.hazard.encounter.enabled": bool(encounter.enabled),
      "system.payload.hazard.encounter.add": encounterAdd
    } : {}),
    "system.detection.enabled": detEnabled,
    "system.detection.dcSource": dcSource,
    "system.detection.dc": detDc,
    "system.detection.requireSearch": bool(detection.requireSearch),
    "system.detection.minRank": minRank
  };
  return {
    ok: true,
    update,
    blockedByWalls: bool(effect.blockedByWalls),
    enabled: bool(f.enabled),
    name: nullableString(f.name)
  };
}

/**
 * Template-friendly view of a trap system object: disposition checked flags and a stable shape.
 * @param {object} system  behavior.system.toObject()
 * @returns {{dispositions:Record<number, boolean>, actorTypes:string[]|null}}
 */
export function trapToFormContext(system) {
  const set = new Set(system?.trigger?.dispositions ?? []);
  return {
    dispositions: Object.fromEntries(ALLOWED_DISPOSITIONS.map((d) => [d, set.has(d)])),
    actorTypes: system?.trigger?.actorTypes ?? null
  };
}
