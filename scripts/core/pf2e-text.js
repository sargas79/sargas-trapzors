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
 * Validate a hazard link. Only "action" items are supported (strikes are deferred).
 * @returns {{ok:boolean, reason:string|null}}
 */
export function checkHazardLink({ actorFound, itemFound, itemType }) {
  if (!actorFound) return { ok: false, reason: "missing-actor" };
  if (!itemFound) return { ok: false, reason: "missing-item" };
  if (itemType !== "action") return { ok: false, reason: "not-an-action" };
  return { ok: true, reason: null };
}
