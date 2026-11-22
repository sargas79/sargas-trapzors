/** Pure linked-region decision logic (plan sections 8, 9, 15). No Foundry globals. */

/**
 * @param {{linkedId:string|null|undefined, regionExists:boolean, flagsMatch:boolean}} input
 * @returns {"none"|"ok"|"missing"|"foreign"}
 */
export function linkStatus({ linkedId, regionExists, flagsMatch }) {
  if (!linkedId) return "none";
  if (!regionExists) return "missing";
  return flagsMatch ? "ok" : "foreign";
}

/**
 * Decide the repair update for one link.
 * @param {"none"|"ok"|"missing"|"foreign"} status
 * @param {string|null|undefined} candidateId  a region in the scene flagged for this trap and role
 * @returns {{action:"keep"|"relink"|"clear", regionId?:string|null}}
 */
export function planRepair(status, candidateId) {
  if (status !== "missing" && status !== "foreign") return { action: "keep" };
  if (candidateId) return { action: "relink", regionId: candidateId };
  return { action: "clear", regionId: null };
}

/**
 * @param {{id:string, trapBehaviorId:string|null|undefined}[]} linkedRegions
 * @param {Iterable<string>} trapBehaviorIdsInScene
 * @returns {string[]} ids of linked regions whose trap behavior no longer exists
 */
export function findOrphans(linkedRegions, trapBehaviorIdsInScene) {
  const alive = new Set(trapBehaviorIdsInScene);
  return linkedRegions.filter((r) => !alive.has(r.trapBehaviorId)).map((r) => r.id);
}

/**
 * Extract the Region and RegionBehavior ids from a trap behavior uuid. The scene part is ignored on
 * purpose: ids survive scene duplication, scene ids do not.
 * @param {string|null|undefined} uuid  e.g. "Scene.a.Region.b.RegionBehavior.c"
 * @returns {{trapRegionId:string, trapBehaviorId:string}|null}
 */
export function parseTrapRef(uuid) {
  if (typeof uuid !== "string") return null;
  const m = /(?:^|\.)Region\.([^.]+)\.RegionBehavior\.([^.]+)$/.exec(uuid);
  return m ? { trapRegionId: m[1], trapBehaviorId: m[2] } : null;
}

/**
 * Which trap ids a detection region refers to: its flags first, else the stored uuid.
 * @returns {{trapRegionId:string, trapBehaviorId:string}|null}
 */
export function resolveTrapRef(flags, uuid) {
  if (flags?.trapRegionId && flags?.trapBehaviorId) {
    return { trapRegionId: flags.trapRegionId, trapBehaviorId: flags.trapBehaviorId };
  }
  return parseTrapRef(uuid);
}
