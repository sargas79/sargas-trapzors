// Foundry-dependent. Never import from tests.
// Built-in animation player for JB2A (and custom) video files. No Sequencer: one PIXI sprite per playback, shown above
// tokens in canvas.interface, played once, then destroyed. Remote clients get the same data over the module socket.
import { MODULE_ID, TRAP_TYPE, HAZARD_FOLDER_NAME } from "../core/constants.js";
import {
  getPreset, getGlow, fileSize, computePlacement, glowPlacement, centerPlacement, isDatabasePath, ANIMATION_MODES
} from "../core/animation-presets.js";

export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const DEFAULT_MS = 6000;
const MAX_MS = 15000;
const JB2A_MODULES = Object.freeze([
  ["jb2a_patreon", "modules/jb2a_patreon/Library"],
  ["JB2A_DnD5e", "modules/JB2A_DnD5e/Library"]
]);

const warn = (msg, err) => console.warn(`${MODULE_ID} | ${msg}`, err ?? "");

/** Library folder of the first active JB2A module (Patreon before free), or null. */
export function jb2aRoot() {
  for (const [id, root] of JB2A_MODULES) if (game.modules.get(id)?.active) return root;
  return null;
}

export function isAvailable() {
  return jb2aRoot() !== null;
}

/* ------------------------------------------------------------ */
/*  Availability (the free JB2A lacks many files)                */
/* ------------------------------------------------------------ */

const availability = new Map(); // full path -> Promise<boolean>

/** Does the preset's file exist in the active JB2A module? HEAD-fetched once, then cached. */
export function presetAvailable(preset) {
  const root = jb2aRoot();
  if (!root || !preset) return Promise.resolve(false);
  const path = `${root}/${preset.path}`;
  if (!availability.has(path)) {
    availability.set(path, fetch(foundry.utils.getRoute(path), { method: "HEAD" })
      .then((r) => r.ok)
      .catch(() => false));
  }
  return availability.get(path);
}

/* ------------------------------------------------------------ */
/*  Local player                                                 */
/* ------------------------------------------------------------ */

const active = new Set(); // cleanup functions of running playbacks
let teardownHooked = false;

function hookTeardown() {
  if (teardownHooked) return;
  teardownHooked = true;
  // Leaving the scene destroys the canvas; stop our sprites first so nothing touches a dead container.
  Hooks.on("canvasTearDown", () => { for (const stop of [...active]) stop(); });
}

const canvasReady = () => !!canvas?.ready && !!canvas.interface && !!canvas.scene;

/**
 * Play one animation on this client. Never throws.
 * @param {{src:string, placement:object, durationMs?:number, sceneId?:string}} opts
 *   placement: {x,y,width,height,rotation,anchorX,anchorY} in canvas pixels. Skipped when sceneId is not the viewed scene.
 * @returns {Promise<boolean>} true when a sprite was shown
 */
export async function playLocal({ src, placement, durationMs = DEFAULT_MS, sceneId } = {}) {
  let texture = null;
  let sprite = null;
  let timer = null;
  let stop = () => {};
  try {
    if (!src || !placement || !canvasReady()) return false;
    if (sceneId && canvas.scene.id !== sceneId) return false;
    const ms = Math.min(MAX_MS, Math.max(500, Number(durationMs) || DEFAULT_MS));

    const loaded = await foundry.canvas.loadTexture(src);
    if (!loaded) return false;
    texture = loaded;
    // The loader shares one video element per file; clone it so overlapping plays do not fight over the playhead.
    const source = game.video.getVideoSource(loaded);
    if (source) texture = await game.video.cloneTexture(source);
    // The scene may have changed while loading.
    if (!canvasReady() || (sceneId && canvas.scene.id !== sceneId)) {
      if (texture !== loaded) texture.destroy(true);
      return false;
    }

    const owned = texture !== loaded ? texture : null; // only a clone is ours to destroy
    sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(placement.anchorX ?? 0.5, placement.anchorY ?? 0.5);
    sprite.width = placement.width;
    sprite.height = placement.height;
    sprite.position.set(placement.x, placement.y);
    sprite.angle = placement.rotation ?? 0;
    sprite.eventMode = "none";

    let done = false;
    stop = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active.delete(stop);
      try { sprite.parent?.removeChild(sprite); } catch { /* canvas already gone */ }
      try { sprite.destroy({ children: true }); } catch { /* already destroyed */ }
      try { owned?.destroy(true); } catch { /* already destroyed */ }
    };
    active.add(stop);
    hookTeardown();
    timer = setTimeout(stop, ms);

    canvas.interface.addChild(sprite);
    if (source) {
      const video = game.video.getVideoSource(texture);
      video.muted = true;
      video.addEventListener("ended", stop, { once: true });
      await game.video.play(video, { loop: false, offset: 0, volume: 0 });
    }
    return true;
  } catch (err) {
    warn("animation failed", err);
    stop();
    return false;
  }
}

/* ------------------------------------------------------------ */
/*  Sargas Visual Automation (SVA)                               */
/* ------------------------------------------------------------ */

const SVA_ID = "sargas-visual-automation";
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const gmUserIds = () => game.users.filter((u) => u.isGM).map((u) => u.id);
/** Name of a trap's persistent SVA effect: how it is found and ended. */
export const persistName = (trap) => `${MODULE_ID}:${trap.id}`;

/** The SVA API when the module is active and ready, else null. */
export function svaApi() {
  const mod = game.modules.get(SVA_ID);
  const api = mod?.active ? mod.api : null;
  return api?.ready === true ? api : null;
}

/** Is Sargas Visual Automation installed, active and ready (whatever the "Animation player" setting says)? */
export function svaActive() {
  return svaApi() !== null;
}

/** Do trap animations play through Visual Automation? Needs it active and the "Animation player" setting on auto. */
export function usingSva() {
  let choice = "auto";
  try { choice = game.settings.get(MODULE_ID, "animationPlayer"); } catch { /* not registered yet */ }
  return choice !== "builtin" && svaActive();
}

/**
 * Play one placed effect through Visual Automation. SVA broadcasts it itself (do not also emit our socket message).
 * `placement` is the built-in player's {x,y,width,height,rotation,anchorX,anchorY}; SVA places by centre, so it is converted.
 * @param {{src:string, placement:object, sceneId:string, gmOnly?:boolean, persistTag?:string|null}} opts
 */
async function playWithSva({ src, placement, sceneId, gmOnly = false, persistTag = null }) {
  const api = svaApi();
  const c = centerPlacement(placement);
  const seq = api.sequence().onScene(sceneId);
  const effect = seq.effect().file(src).atLocation({ x: c.x, y: c.y }).size(c.width, c.height).rotate(c.rotation);
  if (gmOnly) effect.forUsers(gmUserIds());
  if (persistTag) {
    // Fired again while the previous effect is still up: replace it.
    if (api.effects.list({ sceneId, name: persistTag }).length) await api.effects.end({ name: persistTag, sceneId });
    effect.persist(true).name(persistTag);
  }
  await seq.play();
  return true;
}

/** End a trap's persistent Visual Automation effect (Reset, re-arm, Disable, delete). GM only. Never throws. */
export async function endTrapAnimation(trap) {
  try {
    const api = svaApi();
    const sceneId = trap?.scene?.id ?? trap?.parent?.parent?.id;
    if (!api || !sceneId || !game.user.isGM) return;
    const name = persistName(trap);
    if (api.effects.list({ sceneId, name }).length) await api.effects.end({ name, sceneId });
  } catch (err) {
    warn("could not end the persistent animation", err);
  }
}

/** Set to false to stop the module from ever touching Visual Automation's per-actor switch. */
export const SUPPRESS_SVA_HAZARD_ANIMATION = true;

/**
 * Hazard strikes rolled by a trap: Visual Automation's pf2e automation may animate them as well, giving two
 * animations. When SVA is in use and the trap has its own animation, switch SVA's animation off for the trap's hazard
 * actor (only a world actor imported into the module's hazard folder). If the trap loses its animation, the switch is
 * undone, but only if this helper set it.
 * ONE CALL SITE (trigger-service, real fire). Switch it off with SUPPRESS_SVA_HAZARD_ANIMATION.
 * @param {RegionBehavior} trap
 * @param {Actor|null} hazardActor
 */
export async function syncHazardAnimationSuppression(trap, hazardActor) {
  try {
    const api = svaApi();
    if (!SUPPRESS_SVA_HAZARD_ANIMATION || !api?.automation || !hazardActor || !game.user.isGM) return;
    if (hazardActor.pack || hazardActor.folder?.name !== HAZARD_FOLDER_NAME) return;
    const anim = trap.system.effect.animation;
    const own = usingSva() && !!(anim?.preset || anim?.file) && !!trap.system.effect.regionId;
    const disabled = api.automation.isActorDisabled(hazardActor);
    if (own && !disabled) {
      await api.automation.setActorDisabled(hazardActor, true);
      await hazardActor.setFlag(MODULE_ID, "svaDisabled", true);
    } else if (!own && disabled && hazardActor.getFlag(MODULE_ID, "svaDisabled")) {
      await api.automation.setActorDisabled(hazardActor, false);
      await hazardActor.unsetFlag(MODULE_ID, "svaDisabled");
    }
  } catch (err) {
    warn("could not sync Visual Automation for the hazard actor", err);
  }
}

/** Active GM: end the persistent effect of a trap that is deleted. Call once from `ready`. */
export function registerAnimationHooks() {
  Hooks.on("deleteRegionBehavior", (behavior) => {
    if (game.user.isActiveGM && behavior.type === TRAP_TYPE) endTrapAnimation(behavior);
  });
  Hooks.on("deleteRegion", (region) => {
    if (!game.user.isActiveGM) return;
    for (const b of region.behaviors ?? []) if (b.type === TRAP_TYPE) endTrapAnimation(b);
  });
}

/* ------------------------------------------------------------ */
/*  Trap animations                                              */
/* ------------------------------------------------------------ */

/**
 * The file and placement for a trap's animation.
 * @param {{preset?:string|null, file?:string|null, mode?:string}} animation
 * @returns {Promise<{src:string, placement:object}|{note:string}|null>}  null: nothing to play; `note`: why it was skipped
 */
async function resolveAnimation(animation, shapes, scene) {
  if (!animation || !shapes?.length) return null;
  const gridSize = scene?.grid?.size;
  const shape = shapes.find((s) => !s.hole) ?? shapes[0];
  let src;
  let def;
  const preset = animation.preset ? getPreset(animation.preset) : null;
  const mode = ANIMATION_MODES.includes(animation.mode) ? animation.mode : "area";
  if (preset) {
    const root = jb2aRoot();
    if (!root || !(await presetAvailable(preset))) return null;
    src = `${root}/${preset.path}`;
    def = preset;
  } else if (animation.file && isDatabasePath(animation.file)) {
    // A JB2A database path: only Visual Automation can resolve it.
    const api = usingSva() ? svaApi() : null;
    if (!api) return { note: L("SARGAS_TRAPZORS.Animation.NeedsSva", { file: animation.file }) };
    await api.db.ready;
    const px = shape.type === "line" ? shape.length : shape.type === "cone" ? shape.radius : null;
    const distance = px && gridSize ? (px / gridSize) * scene.grid.distance : undefined;
    const r = api.db.resolve(animation.file, distance ? { distance } : undefined);
    const missing = { note: L("SARGAS_TRAPZORS.Animation.DbMissing", { file: animation.file }) };
    if (!r?.file) return missing;
    let size = r.size ?? fileSize(r.file);
    if (!size) {
      const tex = await foundry.canvas.loadTexture(r.file);
      if (!tex) return missing;
      size = { width: tex.width, height: tex.height };
    }
    const t = r.template;
    src = r.file;
    def = { path: r.file, mode, size, template: t ? [t.gridSize, t.startPad, t.endPad] : [size.height, 0, 0] };
  } else if (animation.file) {
    src = animation.file;
    let size = fileSize(src);
    if (!size) {
      const tex = await foundry.canvas.loadTexture(src);
      if (!tex) return null;
      size = { width: tex.width, height: tex.height };
    }
    def = { path: src, mode, size, template: [size.height, 0, 0] };
  } else {
    return null;
  }
  const placement = computePlacement(shape, def, gridSize);
  return placement ? { src, placement } : null;
}

/** Show one placed animation: through Visual Automation when in use, else here and (unless gmOnly) on every client. */
async function show({ scene, src, placement, gmOnly, persistTag }) {
  if (usingSva()) {
    if (!canvas?.scene || canvas.scene.id !== scene.id) return false; // SVA plays on the viewed scene
    return playWithSva({ src, placement, sceneId: scene.id, gmOnly, persistTag });
  }
  const msg = { type: "anim", sceneId: scene.id, src, placement, durationMs: DEFAULT_MS };
  if (!gmOnly) game.socket.emit(SOCKET_CHANNEL, msg);
  return playLocal(msg);
}

/**
 * Play a trap's animation: for everyone, or for GMs only when `test`. Never throws.
 * @param {RegionBehavior} trap
 * @param {object[]} shapes  resolved effect shapes (plain data); the first usable one is used
 * @param {{test?:boolean, animation?:object}} [opts]  `animation` overrides the saved setting (sheet preview)
 * @returns {Promise<{played:boolean, note?:string}>}  `note` says why a configured animation was skipped
 */
export async function playAnimation(trap, shapes, { test = false, animation } = {}) {
  try {
    const scene = trap.scene;
    const anim = animation ?? trap.system.effect.animation;
    const resolved = await resolveAnimation(anim, shapes, scene);
    if (!resolved) return { played: false };
    if (resolved.note) return { played: false, note: resolved.note };
    const persistTag = !test && anim?.persist && usingSva() ? persistName(trap) : null;
    const played = await show({ scene, src: resolved.src, placement: resolved.placement, gmOnly: test, persistTag });
    return { played };
  } catch (err) {
    warn("could not play the trap animation", err);
    return { played: false };
  }
}

/**
 * Play the reveal glow once over a trap's trigger region. Never throws.
 * @param {RegionBehavior} trap
 * @param {{glow?:string|null, preview?:boolean}} [opts]  `glow` overrides the saved key; `preview`: GMs only
 * @returns {Promise<boolean>}
 */
export async function playGlow(trap, { glow, preview = false } = {}) {
  try {
    const key = glow === undefined ? trap.system.detection.revealGlow : glow;
    const def = key ? getGlow(key) : null;
    const root = jb2aRoot();
    const region = trap.region;
    if (!def || !root || !region || !(await presetAvailable({ path: def.path }))) return false;
    const b = region.bounds;
    const placed = glowPlacement(key, { x: b.x, y: b.y, width: b.width, height: b.height });
    if (!placed) return false;
    return await show({ scene: trap.scene, src: `${root}/${placed.src}`, placement: placed.placement, gmOnly: preview, persistTag: null });
  } catch (err) {
    warn("could not play the reveal glow", err);
    return false;
  }
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Only relative, local media paths: no URL scheme, no "..", a video/image extension. */
const SAFE_SRC = /^(?!.*\.\.)(?![a-z][a-z0-9+.-]*:)[\w\-./ %()']+\.(webm|mp4|m4v|webp|png|gif|apng)$/i;

/** Listen for animations other clients ask us to show. Call once from `ready`. */
export function registerAnimationSocket() {
  game.socket.on(SOCKET_CHANNEL, (msg, senderId) => {
    try {
      // Only the GM plays trap animations for others. When Foundry tells us the sender, require a GM.
      if (senderId && !game.users.get(senderId)?.isGM) return;
      if (msg?.type !== "anim" || typeof msg.src !== "string" || typeof msg.sceneId !== "string") return;
      if (!SAFE_SRC.test(msg.src)) return;
      const p = msg.placement;
      if (!p || !["x", "y", "width", "height", "rotation", "anchorX", "anchorY"].every((k) => finite(p[k]))) return;
      playLocal(msg);
    } catch (err) {
      warn("bad animation message", err);
    }
  });
}
