import { CURRENT_SCHEMA_VERSION, STATUS, DISPOSITIONS } from "./constants.js";

/**
 * Default trap system data (plan section 9). Returns a fresh deep object each call.
 * actorTypes null means any actor type.
 */
export function defaultTrapSystem() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: STATUS.ARMED,
    reusable: false,
    revealed: false,
    pending: [],
    lastFired: null,
    rearmSeconds: null,
    trigger: {
      dispositions: [DISPOSITIONS.FRIENDLY],
      actorTypes: null,
      includeHidden: false,
      gmMovementTriggers: false
    },
    effect: { regionId: null, anchor: "fixed", shape: "line", revealSeconds: 6 },
    payload: {
      kind: "none",
      flavor: "",
      soundPath: null,
      roll: { damage: "", damageType: "", save: { statistic: "reflex", dc: null, basic: true } },
      hazard: { actorUuid: null, itemId: null }
    },
    detection: {
      enabled: false,
      regionId: null,
      dcSource: "manual",
      dc: null,
      requireSearch: true,
      minRank: 0,
      checked: []
    }
  };
}
