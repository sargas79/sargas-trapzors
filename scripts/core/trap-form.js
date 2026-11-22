// Pure form <-> trap system mapping (no Foundry globals). Unit-tested in tests/trap-form.test.js.
import { DISPOSITIONS } from "./constants.js";

export const ALLOWED_DISPOSITIONS = Object.freeze([-2, -1, 0, 1]);
export const ANCHORS = Object.freeze(["fixed", "token"]);
export const SHAPES = Object.freeze(["line", "cone", "emanation"]);
export const KINDS = Object.freeze(["none", "roll", "hazard"]);
export const DC_SOURCES = Object.freeze(["manual", "hazard"]);
export const SAVE_STATS = Object.freeze(["fortitude", "reflex", "will"]);

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

  if (errors.length) return { ok: false, errors };

  const update = {
    "system.reusable": bool(f.reusable),
    "system.trigger.dispositions": dispositions,
    "system.trigger.actorTypes": types.length ? types : null,
    "system.trigger.includeHidden": bool(trigger.includeHidden),
    "system.trigger.gmMovementTriggers": bool(trigger.gmMovementTriggers),
    "system.effect.anchor": anchor,
    "system.effect.shape": shape,
    "system.effect.revealSeconds": revealSeconds,
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
