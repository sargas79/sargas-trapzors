/**
 * Pure geometry helpers for effect areas (plan section 10 step 5, A9, A10).
 * Output is plain data matching v14 region shape schemas (common/data/data.mjs).
 * Lengths in gridBased shapes are still pixels (docs/spikes.md S4).
 */

/** Convert scene distance units to pixels. */
export function unitsToPixels(units, { size, distance }) {
  return (units / distance) * size;
}

export const EFFECT_DEFAULTS = Object.freeze({
  line: Object.freeze({ length: 30, width: 5 }),
  cone: Object.freeze({ radius: 15, angle: 90 }),
  emanation: Object.freeze({ radius: 10 })
});

/**
 * @param {"line"|"cone"|"emanation"} kind
 * @param {{x:number, y:number}} origin
 * @param {{type:number, size:number, distance:number}} grid   grid.type 0 means gridless
 */
export function defaultEffectShape(kind, origin, grid) {
  const gridBased = grid.type !== 0;
  const px = (u) => unitsToPixels(u, grid);
  const { x, y } = origin;
  switch (kind) {
    case "line":
      return { type: "line", x, y, length: px(EFFECT_DEFAULTS.line.length), width: px(EFFECT_DEFAULTS.line.width), rotation: 0, gridBased };
    case "cone":
      return { type: "cone", x, y, radius: px(EFFECT_DEFAULTS.cone.radius), angle: EFFECT_DEFAULTS.cone.angle, rotation: 0, curvature: "round", gridBased };
    case "emanation": {
      const base = gridBased
        ? { type: "rectangle", x: x - grid.size / 2, y: y - grid.size / 2, width: grid.size, height: grid.size }
        : { type: "circle", x, y, radius: 1 };
      return { type: "emanation", base, radius: px(EFFECT_DEFAULTS.emanation.radius), gridBased };
    }
    default:
      throw new Error(`Unknown effect shape kind: ${kind}`);
  }
}

/**
 * Center point of a token. Uses token.center when given, else x/y plus half the pixel size.
 * @param {{x:number, y:number, width:number, height:number, gridSize?:number, center?:{x:number,y:number}}} token
 */
export function tokenCenter(token) {
  if (token.center) return { x: token.center.x, y: token.center.y };
  const s = token.gridSize ?? 0;
  return { x: token.x + (token.width * s) / 2, y: token.y + (token.height * s) / 2 };
}

/**
 * Re-anchor a shape on a token. Line/cone move to the token center, rotation unchanged (A9).
 * Emanation uses the token footprint as its base (A10). Other shapes are returned unchanged.
 */
export function anchorShapeToToken(shape, token) {
  const out = structuredClone(shape);
  if (shape.type === "line" || shape.type === "cone") {
    const c = tokenCenter(token);
    out.x = c.x;
    out.y = c.y;
  } else if (shape.type === "emanation") {
    out.base = { type: "token", x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape };
  }
  return out;
}

/** Axis-aligned overlap test for {x,y,width,height} rectangles (cheap pre-filter). */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const NON_BASE_TYPES = ["emanation", "ring"];

/** Can this shape type be the base of an emanation (EmanationShapeData excludes emanation and ring)? */
export function isValidEmanationBase(type) {
  return !!type && !NON_BASE_TYPES.includes(type);
}

/**
 * Detection area: an emanation around the trigger region's first usable shape, else around its bounds.
 * @param {object[]} triggerShapes  plain shape data of the trigger region
 * @param {{x:number,y:number,width:number,height:number}} bounds
 */
export function buildDetectionShape(triggerShapes, bounds, radiusPx, gridBased) {
  const first = (triggerShapes ?? []).find((s) => !s.hole && isValidEmanationBase(s.type));
  const base = first
    ? { ...structuredClone(first), hole: false }
    : { type: "rectangle", x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  return { type: "emanation", base, radius: radiusPx, gridBased: !!gridBased };
}
