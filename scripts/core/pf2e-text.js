/** Pure pf2e/sf2e text builders (plan section 8, docs/spikes.md S5). No Foundry globals. */

const SAVES = ["fortitude", "reflex", "will"];

/** "2d6" + "piercing" -> "2d6[piercing]". Unchanged if no type or the formula already has a bracket. */
export function buildDamageFormula(damage, damageType) {
  const f = String(damage ?? "").trim();
  const t = String(damageType ?? "").trim();
  if (!f || !t || f.includes("[")) return f;
  return `${f}[${t}]`;
}

/** "@Check[reflex|dc:20|basic]". Null when the statistic is not a saving throw. */
export function buildCheckSyntax({ statistic, dc = null, basic = false } = {}) {
  const stat = String(statistic ?? "").trim().toLowerCase();
  if (!SAVES.includes(stat)) return null;
  const parts = [stat];
  if (dc != null) parts.push(`dc:${dc}`);
  if (basic) parts.push("basic");
  return `@Check[${parts.join("|")}]`;
}

/**
 * Validate a hazard link. Supported items: "action" (kind "action") and "melee" (kind "strike";
 * pf2e stores ranged hazard strikes as "melee" too).
 * @returns {{ok:boolean, reason:string|null, kind:"action"|"strike"|null}}
 */
export function checkHazardLink({ actorFound, itemFound, itemType }) {
  if (!actorFound) return { ok: false, reason: "missing-actor", kind: null };
  if (!itemFound) return { ok: false, reason: "missing-item", kind: null };
  if (itemType === "action") return { ok: true, reason: null, kind: "action" };
  if (itemType === "melee") return { ok: true, reason: null, kind: "strike" };
  return { ok: false, reason: "unsupported-item", kind: null };
}

export const STRIKE_TARGET_MODES = Object.freeze(["affected", "triggering"]);

/**
 * Token ids a hazard strike is rolled against.
 * "affected" (default) falls back to the triggering tokens when nobody is affected.
 * @param {{affected?:string[], triggering?:string[], mode?:string, max?:number}} p
 * @returns {{ids:string[], capped:boolean}}
 */
export function strikeTargets({ affected = [], triggering = [], mode = "affected", max = 10 } = {}) {
  const clean = (l) => [...new Set((l ?? []).filter((x) => typeof x === "string" && x))];
  const aff = clean(affected);
  const trig = clean(triggering);
  const list = mode === "triggering" ? trig : (aff.length ? aff : trig);
  const cap = Number.isInteger(max) && max > 0 ? max : 10;
  return { ids: list.slice(0, cap), capped: list.length > cap };
}
