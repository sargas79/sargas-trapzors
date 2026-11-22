/** Pure constants (no Foundry globals). */
export const MODULE_ID = "sargas-trapzors";
export const CURRENT_SCHEMA_VERSION = 2;

/** @enum {string} */
export const STATUS = Object.freeze({ ARMED: "armed", PENDING: "pending", SPENT: "spent" });

/**
 * Mirrors CONST.TOKEN_DISPOSITIONS.
 * Verified against Foundry v14 resources/app/common/constants.mjs: SECRET -2, HOSTILE -1, NEUTRAL 0, FRIENDLY 1.
 */
export const DISPOSITIONS = Object.freeze({ SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });

/** Fully qualified RegionBehavior sub-type key (module id + type key from module.json documentTypes). */
export const TRAP_TYPE = `${MODULE_ID}.trap`;
