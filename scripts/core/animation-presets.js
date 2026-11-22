// Pure JB2A animation presets and placement maths (no Foundry globals). Unit-tested in tests/animation-presets.test.js.
// File paths are relative to the JB2A `Library` folder. Templates are [gridSize, startPoint, endPoint] in file pixels
// (the values JB2A's Sequencer database uses): a stretched effect's visible travel runs from `start` to `width - end`.

export const ANIMATION_MODES = Object.freeze(["stretch", "cone", "area"]);
export const ANIMATION_GROUPS = Object.freeze(["line", "cone", "area", "haunt"]);

const p = (id, group, mode, path, template = [100, 0, 0]) =>
  Object.freeze({ id, labelKey: `SARGAS_TRAPZORS.Animation.Preset.${id}`, group, mode, path, template: Object.freeze(template) });

export const ANIMATION_PRESETS = Object.freeze([
  p("darts", "line", "stretch", "Generic/Weapon_Attacks/Ranged/Dart01_01_Regular_White_30ft_1600x400.webm", [200, 200, 200]),
  p("arrows", "line", "stretch", "Generic/Weapon_Attacks/Ranged/Arrow01_01_Regular_White_30ft_1600x400.webm", [200, 200, 200]),
  p("fireJet", "line", "stretch", "Generic/Template/Line/Breath_Weapon/BreathWeapon_Fire01_Regular_Orange_30ft_Line_Burst_1200x200.webm", [200, 0, 0]),
  p("acidJet", "line", "stretch", "Generic/Template/Line/Breath_Weapon/BreathWeapon_Acid01_Regular_Green_30ft_Line_Burst_1200x200.webm", [200, 0, 0]),
  p("lightning", "line", "stretch", "3rd_Level/Lightning_Bolt/LightningBolt_01_Regular_Blue_4000x400.webm", [100, 0, 0]),
  p("fireCone", "cone", "cone", "1st_Level/Burning_Hands/BurningHands_01_Regular_Orange_600x600.webm"),
  p("frostCone", "cone", "cone", "5th_Level/Cone_Of_Cold/ConeOfCold_01_Regular_Blue_600x600.webm"),
  p("thunderCone", "cone", "cone", "1st_Level/Thunderwave/Thunderwave_01_Bright_Blue_BMid_600x600.webm"),
  p("explosion", "area", "area", "Generic/Explosion/Explosion_01_Orange_400x400.webm"),
  p("fireTrap", "area", "area", "Generic/Traps/FireTrap01_01_Regular_Orange_1000x1000.webm"),
  p("poisonGas", "area", "area", "1st_Level/Fog_Cloud/FogCloud_02_Regular_Green_800x800.webm"),
  p("fallingRocks", "area", "area", "Generic/Traps/Falling_Rocks/FallingRocks01Top_01_Regular_Grey_10x05ft_800x600.webm"),
  p("spikes", "area", "area", "Generic/Traps/Spike_Trap/SpikeTrapTopBase01_01_Regular_Brown_10x10ft_600x600.webm"),
  p("boulderImpact", "area", "area", "Generic/Impact/BoulderImpact_01_Regular_White_500x500.webm"),
  p("shatter", "area", "area", "2nd_Level/Shatter/Shatter_01_Blue_400x400.webm"),
  p("hauntSpirits", "haunt", "area", "3rd_Level/Spirit_Guardians/SpiritGuardiansNoRing_01_Dark_WhiteBlue_600x600.webm"),
  p("hauntSkulls", "haunt", "area", "Cantrip/Toll_The_Dead/TollTheDeadSkullSmoke_01_Regular_Grey_400x400.webm")
]);

/** Preset by id, or null. */
export function getPreset(id) {
  return ANIMATION_PRESETS.find((x) => x.id === id) ?? null;
}

/** Presets belonging to a group, in list order. */
export function presetsByGroup(group) {
  return ANIMATION_PRESETS.filter((x) => x.group === group);
}

/** Pixel size from a `_WxH.webm` suffix; null when the name carries none. @returns {{width:number,height:number}|null} */
export function fileSize(path) {
  const m = /_(\d+)x(\d+)\.[A-Za-z0-9]+(?:\?.*)?$/.exec(String(path ?? ""));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

const rectBounds = (x, y, w, h) => ({ x, y, width: w, height: h });
const num = (v) => typeof v === "number" && Number.isFinite(v);
const rad = (deg) => (deg * Math.PI) / 180;

function pointsBounds(pts) {
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return rectBounds(minX, minY, maxX - minX, maxY - minY);
}

/**
 * Axis-aligned bounds {x,y,width,height} of a plain region shape, in canvas pixels. Null for unknown/invalid shapes.
 * Rectangle rotation is ignored. A `token` base uses grid-cell sizes, hence `gridSizePx`.
 */
export function shapeBounds(shape, gridSizePx) {
  if (!shape || typeof shape !== "object") return null;
  switch (shape.type) {
    case "rectangle":
      return num(shape.x) && num(shape.y) && num(shape.width) && num(shape.height)
        ? rectBounds(shape.x, shape.y, shape.width, shape.height) : null;
    case "circle":
      return num(shape.x) && num(shape.y) && num(shape.radius)
        ? rectBounds(shape.x - shape.radius, shape.y - shape.radius, shape.radius * 2, shape.radius * 2) : null;
    case "ellipse":
      return num(shape.x) && num(shape.y) && num(shape.radiusX) && num(shape.radiusY)
        ? rectBounds(shape.x - shape.radiusX, shape.y - shape.radiusY, shape.radiusX * 2, shape.radiusY * 2) : null;
    case "token":
      if (!num(shape.x) || !num(shape.y) || !num(shape.width) || !num(shape.height) || !num(gridSizePx)) return null;
      return rectBounds(shape.x, shape.y, shape.width * gridSizePx, shape.height * gridSizePx);
    case "polygon": {
      const a = shape.points;
      if (!Array.isArray(a) || a.length < 4) return null;
      const pts = [];
      for (let i = 0; i + 1 < a.length; i += 2) pts.push([a[i], a[i + 1]]);
      return pointsBounds(pts);
    }
    case "emanation": {
      const b = shapeBounds(shape.base, gridSizePx);
      if (!b || !num(shape.radius)) return null;
      return rectBounds(b.x - shape.radius, b.y - shape.radius, b.width + shape.radius * 2, b.height + shape.radius * 2);
    }
    case "line": {
      if (!num(shape.x) || !num(shape.y) || !num(shape.length)) return null;
      const w = num(shape.width) ? shape.width : 0;
      const r = rad(shape.rotation ?? 0);
      const dx = Math.cos(r), dy = Math.sin(r);
      const nx = -dy * (w / 2), ny = dx * (w / 2);
      const ex = shape.x + dx * shape.length, ey = shape.y + dy * shape.length;
      return pointsBounds([[shape.x + nx, shape.y + ny], [shape.x - nx, shape.y - ny], [ex + nx, ey + ny], [ex - nx, ey - ny]]);
    }
    case "cone": {
      if (!num(shape.x) || !num(shape.y) || !num(shape.radius)) return null;
      const angle = num(shape.angle) ? shape.angle : 90;
      const rot = shape.rotation ?? 0;
      const pts = [[shape.x, shape.y]];
      for (let i = 0; i <= 24; i++) {
        const a = rad(rot - angle / 2 + (angle * i) / 24);
        pts.push([shape.x + Math.cos(a) * shape.radius, shape.y + Math.sin(a) * shape.radius]);
      }
      return pointsBounds(pts);
    }
    default:
      return null;
  }
}

/**
 * Where and how big to draw an animation for a shape. Pure; canvas pixels, rotation in degrees (0 = +x).
 * The sprite is positioned at (x, y) with anchor (anchorX, anchorY), then rotated.
 * `preset` is {path, mode, template?, size?}; `size` overrides the size parsed from the file name.
 * Falls back to "area" when the shape does not suit the mode. Null when nothing can be placed.
 *
 * @returns {{x:number,y:number,width:number,height:number,rotation:number,anchorX:number,anchorY:number}|null}
 */
export function computePlacement(shape, preset, gridSizePx) {
  if (!shape || !preset) return null;
  const size = preset.size ?? fileSize(preset.path);
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  const [g, s, e] = preset.template ?? [100, 0, 0];
  const { width: fw, height: fh } = size;
  const effective = fw - s - e;

  if (preset.mode === "stretch" && shape.type === "line" && effective > 0 && g > 0) {
    const scaleX = shape.length / effective;
    const scaleY = Math.max((shape.width ?? 0) / g, scaleX * 0.5);
    return {
      x: shape.x, y: shape.y, width: fw * scaleX, height: fh * scaleY,
      rotation: shape.rotation ?? 0, anchorX: s / fw, anchorY: 0.5
    };
  }
  if (preset.mode === "cone" && shape.type === "cone" && effective > 0) {
    const scale = shape.radius / effective;
    return {
      x: shape.x, y: shape.y, width: fw * scale, height: fh * scale,
      rotation: shape.rotation ?? 0, anchorX: s / fw, anchorY: 0.5
    };
  }
  const b = shapeBounds(shape, gridSizePx);
  if (!b) return null;
  const dim = Math.max(b.width, b.height);
  if (!(dim > 0)) return null;
  const scale = dim / Math.max(fw, fh); // uniform; keeps the aspect ratio of non-square files
  return {
    x: b.x + b.width / 2, y: b.y + b.height / 2, width: fw * scale, height: fh * scale,
    rotation: 0, anchorX: 0.5, anchorY: 0.5
  };
}

/**
 * Suggested preset id for a trap, or null.
 * @param {{kind?:string, traits?:string[], shape?:string|null}} info  kind: hazard kind; shape: line|cone|emanation, null when no effect area
 */
export function suggestPreset({ kind, traits, shape } = {}) {
  if (kind === "haunt") return "hauntSpirits";
  if (!shape) return null; // no effect area: only the kind decides
  const t = new Set((traits ?? []).map((x) => String(x).toLowerCase()));
  const pick = (line, cone, area) => (shape === "line" ? line : shape === "cone" ? cone : area);
  if (t.has("fire")) return pick("fireJet", "fireCone", "fireTrap");
  if (t.has("cold")) return shape === "cone" ? "frostCone" : null;
  if (t.has("electricity")) return shape === "line" ? "lightning" : null;
  if (t.has("poison") || t.has("acid")) return pick("acidJet", null, "poisonGas");
  return shape === "line" ? "darts" : null;
}

/* ------------------------------------------------------------ */
/*  Reveal glow presets                                          */
/* ------------------------------------------------------------ */

const g = (id, path, size) =>
  Object.freeze({ id, labelKey: `SARGAS_TRAPZORS.Glow.Preset.${id}`, path, size: Object.freeze(size) });

/** One-shot glows played over the trigger area when a trap is revealed (JB2A Patreon; paths relative to `Library`). */
export const GLOW_PRESETS = Object.freeze([
  g("detectBlue", "1st_Level/Detect_Magic/DetectMagicCircle_01_Regular_Blue_1200x1200.webm", { width: 1200, height: 1200 }),
  g("detectGreen", "1st_Level/Detect_Magic/DetectMagicCircle_01_Regular_Green_1200x1200.webm", { width: 1200, height: 1200 }),
  g("detectPurple", "1st_Level/Detect_Magic/DetectMagicCircle_01_Regular_Purple_1200x1200.webm", { width: 1200, height: 1200 }),
  g("detectYellow", "1st_Level/Detect_Magic/DetectMagicCircle_01_Regular_Yellow_1200x1200.webm", { width: 1200, height: 1200 }),
  g("detectRed", "1st_Level/Detect_Magic/DetectMagicCircle_01_Dark_Red_1200x1200.webm", { width: 1200, height: 1200 }),
  // The file name carries no WxH; the video is 500x500.
  g("divinationPulse", "TMFX/Runes/Circle/DivinationOutPulse_01_Circle_Normal_500.webm", { width: 500, height: 500 })
]);

/** Glow preset by key, or null (also for null/unknown keys). */
export function getGlow(key) {
  return GLOW_PRESETS.find((x) => x.id === key) ?? null;
}

/**
 * Placement of a glow over a trigger region's bounds: centred, sized so its larger side matches the larger side of
 * the bounds (uniform scale). Null for an unknown glow or empty bounds.
 * @param {string} key  glow preset key
 * @param {{x:number,y:number,width:number,height:number}} bounds  canvas pixels
 * @returns {{src:string, placement:object}|null}  `src` is relative to the JB2A `Library` folder
 */
export function glowPlacement(key, bounds) {
  const glow = getGlow(key);
  if (!glow || !bounds) return null;
  const placement = computePlacement(
    { type: "rectangle", x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    { path: glow.path, mode: "area", size: glow.size }
  );
  return placement ? { src: glow.path, placement } : null;
}

/* ------------------------------------------------------------ */
/*  Visual Automation helpers                                    */
/* ------------------------------------------------------------ */

/** A JB2A database path ("jb2a.spike_trap...") rather than a file path: no "/" and no media extension. */
export function isDatabasePath(src) {
  const s = String(src ?? "").trim();
  return s !== "" && !s.includes("/") && !/\.(webm|mp4|m4v|webp|png|gif|apng)$/i.test(s);
}

/**
 * Re-express a placement (any anchor) as the centre-anchored form Visual Automation uses for placed effects:
 * centre point, size in pixels and rotation in degrees. The drawn result is identical.
 * @param {{x:number,y:number,width:number,height:number,rotation?:number,anchorX?:number,anchorY?:number}} p
 * @returns {{x:number,y:number,width:number,height:number,rotation:number}}
 */
export function centerPlacement(p) {
  const rotation = p.rotation ?? 0;
  const dx = (0.5 - (p.anchorX ?? 0.5)) * p.width;
  const dy = (0.5 - (p.anchorY ?? 0.5)) * p.height;
  const r = rad(rotation);
  return {
    x: p.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: p.y + dx * Math.sin(r) + dy * Math.cos(r),
    width: p.width,
    height: p.height,
    rotation
  };
}
