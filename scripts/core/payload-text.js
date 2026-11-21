/** Pure text/decision builders for payload output (plan sections 10 5d, 11). No Foundry globals. */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Save line for the PUBLIC card. Never includes the DC (plan section 11).
 * @param {{statistic?:string, basic?:boolean}|null|undefined} save
 * @param {{saveTemplate?:string, basicSuffix?:string}} [strings]  Localized templates; {statistic} placeholder.
 * @returns {string|null}
 */
export function buildSaveLine(save, { saveTemplate = "{statistic} save", basicSuffix = "(basic)" } = {}) {
  if (!save?.statistic) return null;
  const line = saveTemplate.replace("{statistic}", cap(save.statistic));
  return save.basic ? `${line} ${basicSuffix}` : line;
}

/** Flavor for the roll message: trap name, damage type, save line. */
export function buildRollFlavor({ trapName, damageType, saveLine }) {
  return [trapName, damageType, saveLine].filter((p) => p && String(p).trim()).join(" · ");
}

/** Test mode whispers everything to GMs and prefixes "[TEST] ". */
export function decideDelivery({ test }) {
  return { whisperToGMs: !!test, prefix: test ? "[TEST] " : "" };
}

/** True when flavor HTML has no visible content. */
export function isEmptyFlavor(html) {
  return String(html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

/** Data for the public card. Deliberately has no DC field. */
export function buildPublicCardData({ trapName, flavorHTML, test }) {
  const d = decideDelivery({ test });
  return { trapName, flavorHTML, whisperToGMs: d.whisperToGMs, prefix: d.prefix };
}

/** Lang key for the GM summary header. */
export function summaryHeaderKey({ blocked = false } = {}) {
  return blocked ? "SARGAS_TRAPZORS.Chat.Blocked" : "SARGAS_TRAPZORS.Chat.Summary";
}

/** Data for the GM-only summary. The DC appears only here. */
export function buildSummaryData({ trapName, triggering = [], affected = [], dc = null, notes = [], test = false, blocked = false }) {
  return {
    trapName,
    triggeringNames: triggering.map((t) => t.name),
    affectedNames: affected.map((t) => t.name),
    affectedUuids: affected.map((t) => t.uuid),
    blocked,
    headerKey: summaryHeaderKey({ blocked }),
    dc: dc ?? null,
    notes: [...notes],
    prefix: decideDelivery({ test }).prefix
  };
}
