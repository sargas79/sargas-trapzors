/**
 * Decide whether a token may trigger a trap (plan A3/A4). Pure.
 * @param {{hasActor:boolean, hidden:boolean, disposition:number, actorType:string|null}} token
 * @param {{dispositions:number[], actorTypes:string[]|null, includeHidden:boolean}} rules
 * @param {{moverIsGM:boolean, gmMovementTriggers:boolean}} ctx
 * @returns {{eligible:boolean, reason:string|null}}
 */
export function evaluateEligibility(token, rules, ctx) {
  const no = (reason) => ({ eligible: false, reason });
  if (!token.hasActor) return no("no-actor");
  if (ctx.moverIsGM && !ctx.gmMovementTriggers) return no("gm-movement");
  if (token.hidden && !rules.includeHidden) return no("hidden");
  if (!(rules.dispositions ?? []).includes(token.disposition)) return no("disposition");
  if (rules.actorTypes != null && !rules.actorTypes.includes(token.actorType)) return no("actor-type");
  return { eligible: true, reason: null };
}
