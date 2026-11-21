// Foundry-dependent. Never import from tests.
// Effect areas are linked GM-only Regions (plan section 8). All writes are GM-only.
import { MODULE_ID } from "../core/constants.js";
import { defaultEffectShape, anchorShapeToToken, rectsOverlap } from "../core/geometry.js";

const VIS = () => CONST.REGION_VISIBILITY ?? { GAMEMASTER: 1, ALWAYS: 2 };
const EFFECT_COLOR = "#ff6a00";
const REVEAL_COLOR = "#ff2a2a";

function asBehavior(b) {
  return typeof b === "string" ? fromUuidSync(b) : b;
}

function requireGM() {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
}

/** Pixel-space token data used by the pure anchoring helpers. */
function tokenData(token) {
  const c = token.getCenterPoint?.();
  return {
    x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape,
    gridSize: token.parent?.grid?.size, center: c ? { x: c.x, y: c.y } : undefined
  };
}

function gridOf(scene) {
  const g = scene.grid;
  return { type: g.type, size: g.size, distance: g.distance };
}

/** The single level to use for wall-constrained regions (verified requirement: exactly one). */
function constraintLevel(behavior) {
  const region = behavior.region;
  const scene = behavior.scene;
  return [...(region?.levels ?? [])][0] ?? scene.levels?.contents?.[0]?.id ?? null;
}

function restrictionFor(behavior) {
  const enabled = !!behavior.system.effect.blockedByWalls;
  return { enabled, type: "move" };
}

function levelsFor(behavior) {
  if (!behavior.system.effect.blockedByWalls) return [];
  const id = constraintLevel(behavior);
  return id ? [id] : [];
}

function flagsFor(behavior, role) {
  return { [MODULE_ID]: { role, trapRegionId: behavior.region?.id ?? null, trapBehaviorId: behavior.id } };
}

/** The linked effect region document, or null. */
export function getEffectRegion(behavior) {
  const id = behavior.system.effect.regionId;
  return id ? behavior.scene?.regions?.get(id) ?? null : null;
}

/**
 * Create the linked effect region with a default shape and link it to the trap.
 * @param {RegionBehavior|string} behavior
 * @param {{kind?:"line"|"cone"|"emanation", anchor?:"fixed"|"token", origin?:{x:number,y:number}}} [opts]
 */
export async function createEffectArea(behavior, { kind = "line", anchor = "fixed", origin } = {}) {
  requireGM();
  behavior = asBehavior(behavior);
  const scene = behavior.scene;
  const trigger = behavior.region;
  const b = trigger.bounds;
  const at = origin ?? { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const shape = defaultEffectShape(kind, at, gridOf(scene));
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: `${trigger.name} (effect)`,
    color: EFFECT_COLOR,
    visibility: VIS().GAMEMASTER,
    ownership: { default: 0 },
    shapes: [shape],
    behaviors: [],
    flags: flagsFor(behavior, "effect")
  }]);
  await behavior.update({ "system.effect.regionId": region.id, "system.effect.shape": kind, "system.effect.anchor": anchor });
  if (behavior.system.effect.blockedByWalls) await setBlockedByWalls(behavior, true);
  return region;
}

/** Toggle wall blocking on the trap and its effect region (restriction type "move"). */
export async function setBlockedByWalls(behavior, on) {
  requireGM();
  behavior = asBehavior(behavior);
  on = !!on;
  await behavior.update({ "system.effect.blockedByWalls": on });
  const region = getEffectRegion(behavior);
  if (!region) return null;
  const update = { restriction: { enabled: on, type: "move" } };
  if (on) {
    const level = constraintLevel(behavior);
    if (level) update.levels = [level];
  }
  await region.update(update);
  return region;
}

/** Shapes (plain data) for the effect, anchored on the token in token mode. Null when no effect region. */
export function resolveEffectShapes(behavior, anchorToken) {
  behavior = asBehavior(behavior);
  const region = getEffectRegion(behavior);
  if (!region) return null;
  const shapes = region.toObject().shapes;
  if (behavior.system.effect.anchor !== "token") return shapes;
  if (!anchorToken) return shapes;
  const t = tokenData(anchorToken);
  return shapes.map((s) => anchorShapeToToken(s, t));
}

/** Transient (non-persisted) region used for containment tests. */
async function transientRegion(behavior, shapes) {
  const scene = behavior.scene;
  const tmp = new CONFIG.Region.documentClass({
    name: "sargas-trapzors-effect-tmp",
    shapes,
    restriction: restrictionFor(behavior),
    levels: levelsFor(behavior)
  }, { parent: scene });
  if (behavior.system.effect.blockedByWalls) tmp.updateShapeConstraints(); // no save
  return tmp;
}

/** TokenDocuments whose footprint is inside the effect area. */
export async function resolveAffectedTokens(behavior, anchorToken) {
  behavior = asBehavior(behavior);
  const shapes = resolveEffectShapes(behavior, anchorToken);
  if (!shapes) return [];
  const scene = behavior.scene;
  const tmp = await transientRegion(behavior, shapes);
  const size = scene.grid.size;
  let bounds = null;
  try { bounds = tmp.bounds; } catch { bounds = null; }
  const out = [];
  for (const token of scene.tokens) {
    if (bounds) {
      const rect = { x: token.x, y: token.y, width: token.width * size, height: token.height * size };
      if (!rectsOverlap(bounds, rect)) continue;
    }
    if (token.testInsideRegion(tmp)) out.push(token);
  }
  return out;
}

/**
 * Show the effect area temporarily. Test mode keeps it GM-only.
 * @returns {Promise<RegionDocument|null>}
 */
export async function revealEffect(behavior, shapes, { test = false, seconds } = {}) {
  behavior = asBehavior(behavior);
  if (!shapes?.length) return null;
  const scene = behavior.scene;
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: `${behavior.region.name} (reveal)`,
    color: REVEAL_COLOR,
    visibility: test ? VIS().GAMEMASTER : VIS().ALWAYS,
    ownership: { default: 0 },
    shapes,
    behaviors: [],
    restriction: restrictionFor(behavior),
    levels: levelsFor(behavior),
    flags: flagsFor(behavior, "reveal")
  }]);
  const ms = Math.max(0, (seconds ?? behavior.system.effect.revealSeconds) * 1000);
  setTimeout(() => {
    // The scene/region may be gone by then.
    scene.regions.get(region.id)?.delete().catch(() => {});
  }, ms);
  return region;
}

/** GM-only preview of the effect area. Token-anchored traps use the given or first controlled token. */
export async function previewEffect(behavior, token) {
  requireGM();
  behavior = asBehavior(behavior);
  token ??= canvas.tokens?.controlled?.[0]?.document;
  const shapes = resolveEffectShapes(behavior, token);
  if (!shapes) return null;
  return revealEffect(behavior, shapes, { test: true });
}

/**
 * Used by Fire / Fire-as-test: resolve, reveal and report affected tokens.
 * @returns {Promise<{configured:boolean, affected:TokenDocument[]}>}
 */
export async function fireEffect(behavior, anchorToken, { test = false } = {}) {
  const region = getEffectRegion(behavior);
  if (!region) return { configured: false, affected: [] };
  const shapes = resolveEffectShapes(behavior, anchorToken);
  const affected = await resolveAffectedTokens(behavior, anchorToken);
  await revealEffect(behavior, shapes, { test });
  return { configured: true, affected };
}

/** Crash cleanup: active GM removes leftover reveal regions in every scene. */
export async function cleanupReveals() {
  if (!game.user.isActiveGM) return;
  for (const scene of game.scenes) {
    const ids = scene.regions.filter((r) => r.getFlag(MODULE_ID, "role") === "reveal").map((r) => r.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}
