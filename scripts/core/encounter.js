// Pure helpers for complex-hazard encounters (no Foundry globals). Unit-tested in tests/encounter.test.js.

export const ENCOUNTER_ADD_MODES = Object.freeze(["triggering", "affected", "none"]);

const clean = (list) => [...new Set((list ?? []).filter((x) => typeof x === "string" && x))];

/**
 * Token ids to add to the encounter besides the hazard: the chosen group, without duplicates and without
 * tokens already in the combat.
 * @param {{mode?:string, affected?:string[], triggering?:string[], existing?:string[]}} p
 * @returns {string[]}
 */
export function encounterCreatures({ mode = "triggering", affected = [], triggering = [], existing = [] } = {}) {
  const skip = new Set(clean(existing));
  const list = mode === "affected" ? clean(affected) : mode === "triggering" ? clean(triggering) : [];
  return list.filter((id) => !skip.has(id));
}

/**
 * Token ids a routine strike is rolled against: the GM's targeted tokens, else those in the effect area,
 * else those in the trigger region.
 * @param {{targeted?:string[], affected?:string[], inTrigger?:string[]}} p
 * @returns {{ids:string[], source:"targeted"|"affected"|"trigger"|"none"}}
 */
export function routineTargets({ targeted = [], affected = [], inTrigger = [] } = {}) {
  for (const [source, list] of [["targeted", targeted], ["affected", affected], ["trigger", inTrigger]]) {
    const ids = clean(list);
    if (ids.length) return { ids, source };
  }
  return { ids: [], source: "none" };
}
