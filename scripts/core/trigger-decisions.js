/**
 * Pure decision helpers for the trigger pipeline (plan section 10). Plain-data inputs only.
 */

/**
 * What the MOVER's client does on tokenMoveIn.
 * @param {{isSelf:boolean, hasActiveGM:boolean, eligible:boolean, canTrigger:boolean}} input
 * @returns {"stop"|"none"}
 */
export function decideMoverAction({ isSelf, hasActiveGM, eligible, canTrigger }) {
  return isSelf && hasActiveGM && eligible && canTrigger ? "stop" : "none";
}

/**
 * What the ACTIVE GM's client does on tokenMoveIn. Inputs come from document state, not event data.
 * @param {{isActiveGM:boolean, tokenExists:boolean, insideRegion:boolean, eligible:boolean,
 *          canTrigger:boolean, isDuplicate:boolean}} input
 * @returns {{action:"queue"|"ignore", reason:string}}
 */
export function decideAuthorityAction({ isActiveGM, tokenExists, insideRegion, eligible, canTrigger, isDuplicate }) {
  const ignore = (reason) => ({ action: "ignore", reason });
  if (!isActiveGM) return ignore("not-authority");
  if (!tokenExists) return ignore("token-missing");
  if (!insideRegion) return ignore("outside-region");
  if (!eligible) return ignore("ineligible");
  if (!canTrigger) return ignore("not-triggerable");
  if (isDuplicate) return ignore("duplicate");
  return { action: "queue", reason: "ok" };
}
