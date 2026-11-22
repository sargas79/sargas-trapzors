// Foundry-dependent. Never import from tests.
// Effect areas are linked GM-only Regions (plan section 8). All writes are GM-only.
import { MODULE_ID } from "../core/constants.js";
import { removeLinkedRegion } from "./linked-regions.js";
import { playAnimation } from "./animations.js";
import { defaultEffectShape, anchorShapeToToken, rectsOverlap } from "../core/geometry.js";
import { chooseConstraintLevel } from "../core/levels.js";

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

/**
 * The single level of the persisted effect region shown on the map (native wall clipping needs exactly one level).
 * Containment tests use {@link containmentLevel} instead.
 */
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

/** The scene's levels in scene order, for the pure level choice. */
function sceneLevels(scene) {
  const list = scene.levels?.sorted ?? scene.levels?.contents ?? [];
  return list.map((l) => ({ id: l.id, elevation: l.elevation?.base ?? l.elevation?.bottom }));
}

/**
 * The level whose walls clip this fire (S7): the token's level for a token-anchored effect, else the trigger
 * region's level that holds the token, else its lowest level, else the scene's first level.
 */
function containmentLevel(behavior, anchorToken) {
  return chooseConstraintLevel({
    anchor: behavior.system.effect.anchor,
    tokenLevel: anchorToken?._source?.level ?? anchorToken?.level ?? null,
    regionLevels: [...(behavior.region?.levels ?? [])],
    levels: sceneLevels(behavior.scene)
  });
}

/**
 * Wall constraint polygons for a region on `level`, computed like RegionDocument#_computeShapeConstraints for type
 * "move" (client/documents/region.mjs:1062-1118) but without its "level must be viewed" gate (S7).
 */
function computeConstraints(region, level) {
  const constraints = region.shapes.map(() => undefined);
  const groups = {};
  for (const [i, shape] of region.shapes.entries()) {
    const x = Math.round(shape.origin.x);
    const y = Math.round(shape.origin.y);
    const key = `${x},${y}`;
    if (groups[key]) {
      groups[key].boundingBox.enlarge(shape.bounds);
      groups[key].indices.push(i);
    } else {
      groups[key] = { origin: { x, y }, boundingBox: shape.bounds.clone(), indices: [i] };
    }
  }
  const { type, priority } = region.restriction;
  for (const { origin, boundingBox, indices } of Object.values(groups)) {
    const polygon = CONFIG.Canvas.polygonBackends[type].create(origin, {
      type,
      level,
      priority,
      edgeTypes: { wall: true, outerBounds: true },
      boundingBox: boundingBox.fit(level.parent.dimensions.rect).ceil(),
      useThreshold: true
    });
    for (const i of indices) constraints[i] = polygon.points;
  }
  return constraints;
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
  await removeLinkedRegion(behavior, "effect"); // no orphan from a previous area
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

/**
 * Transient (non-persisted) region used for containment tests. When blocked by walls it is limited to `levelId`
 * (so tokens on other levels are never inside it) and clipped by that level's walls.
 * @returns {Promise<{region:RegionDocument, walls:"off"|"ok"|"scene-not-viewed"|"failed"}>}
 */
async function transientRegion(behavior, shapes, levelId) {
  const scene = behavior.scene;
  const blocked = !!behavior.system.effect.blockedByWalls;
  const tmp = new CONFIG.Region.documentClass({
    name: "sargas-trapzors-effect-tmp",
    shapes,
    restriction: restrictionFor(behavior),
    levels: blocked && levelId ? [levelId] : []
  }, { parent: scene });
  if (!blocked) return { region: tmp, walls: "off" };
  // Without computed constraints a restricted region contains nothing, so when clipping is impossible use the area
  // unclipped (still limited to the chosen level), as the GM note says.
  const unclipped = (walls) => ({
    region: new CONFIG.Region.documentClass({
      name: "sargas-trapzors-effect-tmp",
      shapes,
      restriction: { enabled: false, type: "move" },
      levels: levelId ? [levelId] : []
    }, { parent: scene }),
    walls
  });
  const level = levelId ? scene.levels.get(levelId) : null;
  if (!level) return unclipped("failed");
  if (level.isView) {
    tmp.updateShapeConstraints(); // the level the GM is viewing: native, no save (as in 0.3.0)
    return { region: tmp, walls: "ok" };
  }
  // Another level of the viewed scene: every level has its own wall edges there (S7). A scene that is not viewed has none.
  if (!scene.isView) return unclipped("scene-not-viewed");
  try {
    tmp.updateSource({ _shapeConstraints: computeConstraints(tmp, level) });
    return { region: tmp, walls: "ok" };
  } catch (err) {
    console.error(`${MODULE_ID} | wall clipping failed`, err);
    return unclipped("failed");
  }
}

/** GM summary note for a wall status that was not "ok" or "off". */
function wallNote(walls) {
  if (walls === "scene-not-viewed") return game.i18n.localize("SARGAS_TRAPZORS.Chat.WallsSkipped");
  if (walls === "failed") return game.i18n.localize("SARGAS_TRAPZORS.Chat.WallsFailed");
  return null;
}

/** TokenDocuments inside the effect area, plus the wall status of the clipping. */
async function resolveAffected(behavior, anchorToken) {
  const shapes = resolveEffectShapes(behavior, anchorToken);
  if (!shapes) return { tokens: [], walls: "off", level: null };
  const scene = behavior.scene;
  const level = behavior.system.effect.blockedByWalls ? containmentLevel(behavior, anchorToken) : null;
  const { region: tmp, walls } = await transientRegion(behavior, shapes, level);
  const size = scene.grid.size;
  let bounds = null;
  try { bounds = tmp.bounds; } catch { bounds = null; }
  const tokens = [];
  for (const token of scene.tokens) {
    if (bounds) {
      const rect = { x: token.x, y: token.y, width: token.width * size, height: token.height * size };
      if (!rectsOverlap(bounds, rect)) continue;
    }
    if (token.testInsideRegion(tmp)) tokens.push(token);
  }
  return { tokens, walls, level };
}

/** TokenDocuments whose footprint is inside the effect area. */
export async function resolveAffectedTokens(behavior, anchorToken) {
  behavior = asBehavior(behavior);
  return (await resolveAffected(behavior, anchorToken)).tokens;
}

/**
 * Show the effect area temporarily. Test mode keeps it GM-only.
 * @returns {Promise<RegionDocument|null>}
 */
export async function revealEffect(behavior, shapes, { test = false, seconds, level } = {}) {
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
    levels: behavior.system.effect.blockedByWalls && level ? [level] : levelsFor(behavior),
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
 * @returns {Promise<{configured:boolean, affected:TokenDocument[], notes:string[]}>}  `notes` go in the GM summary
 */
export async function fireEffect(behavior, anchorToken, { test = false } = {}) {
  const region = getEffectRegion(behavior);
  if (!region) return { configured: false, affected: [], notes: [] };
  const shapes = resolveEffectShapes(behavior, anchorToken);
  const { tokens: affected, walls, level } = await resolveAffected(behavior, anchorToken);
  const notes = [];
  const note = wallNote(walls);
  if (note) notes.push(note);
  await revealEffect(behavior, shapes, { test, level });
  // Fire and forget: playAnimation never throws, and loading a video must not delay the effect.
  playAnimation(behavior, shapes, { test })
    .then((res) => { if (res.note && game.user.isGM) ui.notifications.warn(res.note); })
    .catch((err) => console.error(`${MODULE_ID} | animation failed`, err));
  return { configured: true, affected, notes };
}

/** Crash cleanup: active GM removes leftover reveal regions in every scene. */
export async function cleanupReveals() {
  if (!game.user.isActiveGM) return;
  for (const scene of game.scenes) {
    const ids = scene.regions.filter((r) => r.getFlag(MODULE_ID, "role") === "reveal").map((r) => r.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}
