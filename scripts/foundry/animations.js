// Foundry-dependent. Never import from tests.
// Built-in animation player for JB2A (and custom) video files. No Sequencer: one PIXI sprite per playback, shown above
// tokens in canvas.interface, played once, then destroyed. Remote clients get the same data over the module socket.
import { MODULE_ID } from "../core/constants.js";
import { getPreset, fileSize, computePlacement, ANIMATION_MODES } from "../core/animation-presets.js";

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
/*  Trap animations                                              */
/* ------------------------------------------------------------ */

/**
 * The file and placement for a trap's animation, or null when there is none to play.
 * @param {{preset?:string|null, file?:string|null, mode?:string}} animation
 */
async function resolveAnimation(animation, shapes, gridSize) {
  if (!animation || !shapes?.length) return null;
  const shape = shapes.find((s) => !s.hole) ?? shapes[0];
  let src;
  let def;
  const preset = animation.preset ? getPreset(animation.preset) : null;
  if (preset) {
    const root = jb2aRoot();
    if (!root || !(await presetAvailable(preset))) return null;
    src = `${root}/${preset.path}`;
    def = preset;
  } else if (animation.file) {
    src = animation.file;
    let size = fileSize(src);
    if (!size) {
      const tex = await foundry.canvas.loadTexture(src);
      if (!tex) return null;
      size = { width: tex.width, height: tex.height };
    }
    const mode = ANIMATION_MODES.includes(animation.mode) ? animation.mode : "area";
    def = { path: src, mode, size, template: [size.height, 0, 0] };
  } else {
    return null;
  }
  const placement = computePlacement(shape, def, gridSize);
  return placement ? { src, placement } : null;
}

/**
 * Play a trap's animation here and, unless `test`, on every other client. Never throws.
 * @param {RegionBehavior} trap
 * @param {object[]} shapes  resolved effect shapes (plain data); the first usable one is used
 * @param {{test?:boolean, animation?:object}} [opts]  `animation` overrides the saved setting (sheet preview)
 * @returns {Promise<boolean>} true when something was played locally
 */
export async function playAnimation(trap, shapes, { test = false, animation } = {}) {
  try {
    const scene = trap.scene;
    const resolved = await resolveAnimation(animation ?? trap.system.effect.animation, shapes, scene?.grid?.size);
    if (!resolved) return false;
    const msg = { type: "anim", sceneId: scene.id, src: resolved.src, placement: resolved.placement, durationMs: DEFAULT_MS };
    if (!test) game.socket.emit(SOCKET_CHANNEL, msg);
    return await playLocal(msg);
  } catch (err) {
    warn("could not play the trap animation", err);
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
