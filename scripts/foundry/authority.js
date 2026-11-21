// Foundry-dependent. Never import from tests.

/** Is this client the single active GM (the only client allowed to act on triggers)? */
export function isAuthority() {
  return game.user?.isActiveGM === true;
}

/** Is any GM currently connected and active? */
export function hasActiveGM() {
  return !!game.users?.activeGM;
}

/**
 * Validate a movement event against document state instead of trusting event data (plan section 11).
 * @param {TokenDocument} token   Token document from the event.
 * @param {RegionDocument} region The trap's region.
 * @returns {{tokenExists:boolean, insideRegion:boolean}}
 */
export function validateTokenInRegion(token, region) {
  const live = token?.id ? region?.parent?.tokens?.get(token.id) : null;
  if (!live) return { tokenExists: false, insideRegion: false };
  let insideRegion = false;
  try { insideRegion = !!live.testInsideRegion(region); } catch { insideRegion = false; }
  return { tokenExists: true, insideRegion };
}

/** Eligibility input (plain data) from a TokenDocument. */
export function tokenEligibilityInput(token) {
  return {
    hasActor: !!token.actor,
    hidden: !!token.hidden,
    disposition: token.disposition,
    actorType: token.actor?.type ?? null
  };
}
