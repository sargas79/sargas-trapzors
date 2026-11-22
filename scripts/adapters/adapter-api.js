/** Raised when an adapter does not implement a payload operation. */
export class UnsupportedPayloadError extends Error {
  constructor(adapterId, operation) {
    super(`Adapter "${adapterId}" does not support ${operation}`);
    this.name = "UnsupportedPayloadError";
    this.adapterId = adapterId;
    this.operation = operation;
  }
}

/**
 * @typedef {object} PayloadContext
 * @property {RegionBehavior} behavior
 * @property {string} trapName
 * @property {object} payload           behavior.system.payload (plain data)
 * @property {TokenDocument[]} affected
 * @property {TokenDocument[]} triggering
 * @property {boolean} test
 * @property {object} speaker
 */

/** Base adapter: core code never touches actor.system, only this interface. */
export class TrapAdapter {
  /** @type {string} */
  get id() { return "base"; }

  /** @returns {{roll:boolean, hazard:boolean, detection:boolean, browse:boolean}} */
  get capabilities() { return { roll: false, hazard: false, detection: false, browse: false }; }

  /** Post the roll payload. @param {PayloadContext} ctx @returns {Promise<{dc?:number|null, notes?:string[]}|void>} */
  async rollPayload(ctx) { throw new UnsupportedPayloadError(this.id, "rollPayload"); }

  /** Post a hazard action. @param {PayloadContext} ctx */
  async postHazardAction(ctx) { throw new UnsupportedPayloadError(this.id, "postHazardAction"); }

  /** Roll detection. @param {object} ctx */
  async rollDetection(ctx) { throw new UnsupportedPayloadError(this.id, "rollDetection"); }

  /** @param {object} ctx @returns {number|null} */
  getStealthDC(ctx) { throw new UnsupportedPayloadError(this.id, "getStealthDC"); }

  /**
   * Summarise a hazard actor for trap configuration.
   * @param {Actor} actor
   * @returns {{kind:string, level:number, isComplex:boolean, stealthDC:number|null, minRank:number, actionId:string|null,
   *   disableHTML:string, resetText:string, rearmSeconds:number|null}|null}
   */
  describeHazard(actor) { throw new UnsupportedPayloadError(this.id, "describeHazard"); }

  /** Disable-check HTML of a hazard actor ("" when none). @param {Actor} actor @returns {string} */
  getDisableHTML(actor) { throw new UnsupportedPayloadError(this.id, "getDisableHTML"); }

  /** Display label for a trait slug. @param {string} slug @returns {string} */
  traitLabel(slug) { return String(slug); }

  /** Compendium hazard index for the browser. @param {{refresh?:boolean}} [opts] @returns {Promise<object[]>} */
  async getHazardIndex(opts) { throw new UnsupportedPayloadError(this.id, "getHazardIndex"); }

  /**
   * Check a payload before firing (e.g. a broken hazard link). May be sync or async.
   * @param {object} payload
   * @returns {{ok:true}|{ok:false, reason:string, message:string}|Promise<{ok:boolean, reason?:string, message?:string}>}
   */
  validatePayload(payload) { return { ok: true }; }

  /** @returns {{dispositions:number[], actorTypes:string[]|null}} */
  eligibilityDefaults() { return { dispositions: [1], actorTypes: null }; }
}
