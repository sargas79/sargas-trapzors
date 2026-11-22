/** Pure target-picking, degree-of-success and detection-key helpers for theater of the mind. No Foundry globals. */

/**
 * @typedef {{uuid:string, name:string, actorUuid?:string|null, img?:string|null}} TargetInput
 * @typedef {{key:string, uuid:string, name:string, kind:"party"|"owned"|"token", actorUuid:string|null, img:string|null, checked:boolean}} TargetOption
 */

/**
 * Ordered, deduplicated target options: party members, other player-owned characters, then tokens.
 * An actor that also has a token entry is dropped in favour of the token entry; repeated uuids appear once.
 * @param {{party?:TargetInput[], owned?:TargetInput[], tokens?:TargetInput[], chosen?:string[]}} p
 * @returns {TargetOption[]}
 */
export function pickTargets({ party = [], owned = [], tokens = [], chosen = [] } = {}) {
  const chosenSet = new Set(chosen);
  const tokenActors = new Set(tokens.map((t) => t.actorUuid).filter(Boolean));
  const seen = new Set();
  const out = [];
  const add = (list, kind) => {
    for (const t of list) {
      if (!t?.uuid || seen.has(t.uuid)) continue;
      if (kind !== "token" && tokenActors.has(t.uuid)) continue; // the token entry wins
      seen.add(t.uuid);
      out.push({
        key: t.uuid, uuid: t.uuid, name: t.name ?? "", kind, img: t.img ?? null,
        actorUuid: kind === "token" ? t.actorUuid ?? null : t.uuid,
        checked: chosenSet.has(t.uuid)
      });
    }
  };
  add(party, "party");
  add(owned, "owned");
  add(tokens, "token");
  return out;
}

/**
 * pf2e degree of success for a check: 0 critical failure, 1 failure, 2 success, 3 critical success.
 * Beating the DC by 10 or more raises the degree, missing by 10 or more lowers it; a natural 20 raises it one
 * step and a natural 1 lowers it one step (after the margin step). Clamped to 0..3.
 * @param {{total:number, dc:number, die?:number|null}} p
 * @returns {number|null} null when total or dc is not a finite number
 */
export function degreeOfSuccess({ total, dc, die = null }) {
  if (!Number.isFinite(total) || !Number.isFinite(dc)) return null;
  let degree = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (die === 20) degree += 1;
  else if (die === 1) degree -= 1;
  return Math.max(0, Math.min(3, degree));
}

/**
 * Key under which a detection check is stored in `system.detection.checked`: the token uuid when the target
 * is a token, else the actor uuid.
 * @param {{tokenUuid?:string|null, actorUuid?:string|null}} p
 * @returns {string|null}
 */
export function detectionKey({ tokenUuid = null, actorUuid = null } = {}) {
  return tokenUuid || actorUuid || null;
}
