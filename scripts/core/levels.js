// Pure level choice for wall-constrained effect areas (no Foundry globals). Unit-tested in tests/levels.test.js.

/**
 * The level whose walls clip a trap's effect area on a multi-level scene.
 * - Token-anchored effect: the triggering token's level.
 * - Fixed effect: the trigger region's level that holds the triggering token; else the region's lowest level
 *   (by elevation); a region with no levels is in every level, so the token's level applies, else the scene's first.
 * - No usable token level: the fixed rule without a token.
 * Ids that are not in `levels` are ignored. Null when the scene has no levels.
 *
 * @param {{anchor:"fixed"|"token", tokenLevel?:string|null, regionLevels?:string[],
 *   levels:{id:string, elevation?:number}[]}} input  `levels` in scene order (first = the scene's first level)
 * @returns {string|null}
 */
export function chooseConstraintLevel({ anchor = "fixed", tokenLevel = null, regionLevels = [], levels = [] } = {}) {
  if (!levels.length) return null;
  const known = new Map(levels.map((l, i) => [l.id, { index: i, elevation: Number.isFinite(l.elevation) ? l.elevation : 0 }]));
  const hasToken = tokenLevel != null && known.has(tokenLevel);
  if (anchor === "token" && hasToken) return tokenLevel;
  const own = (regionLevels ?? []).filter((id) => known.has(id));
  if (!own.length) return hasToken ? tokenLevel : levels[0].id; // no (valid) region levels: in every level
  if (hasToken && own.includes(tokenLevel)) return tokenLevel;
  return own.reduce((best, id) => {
    const a = known.get(id);
    const b = known.get(best);
    return a.elevation < b.elevation || (a.elevation === b.elevation && a.index < b.index) ? id : best;
  });
}
