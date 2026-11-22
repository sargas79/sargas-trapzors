// Foundry-dependent. Never import from tests.
import { CURRENT_SCHEMA_VERSION, STATUS, DISPOSITIONS } from "../core/constants.js";
import { makeTriggerKey } from "../core/dedupe.js";
import { evaluateEligibility } from "../core/eligibility.js";
import { canTrigger } from "../core/trap-state.js";
import { rootMovementId } from "../core/movement.js";
import { decideMoverAction, decideAuthorityAction } from "../core/trigger-decisions.js";
import { hasActiveGM, isAuthority, validateTokenInRegion } from "./authority.js";
import { getTriggerService } from "./trigger-service.js";

const fields = foundry.data.fields;

/** Eligibility input from a TokenDocument. */
function tokenInput(token) {
  return {
    hasActor: !!token.actor,
    hidden: !!token.hidden,
    disposition: token.disposition,
    actorType: token.actor?.type ?? null
  };
}

/**
 * Region behavior sub-type "sargas-trapzors.trap". Schema mirrors core/trap-defaults.js (plan section 9).
 * `disabled` is the native behavior flag, not part of system data.
 */
export default class TrapBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  /** @override */
  static LOCALIZATION_PREFIXES = ["SARGAS_TRAPZORS.Behavior.trap", "BEHAVIOR.TYPES.base"];

  /** @override */
  static defineSchema() {
    const str = (opts = {}) => new fields.StringField({ required: true, ...opts });
    const nullableStr = () => new fields.StringField({ required: true, nullable: true, blank: false, initial: null });
    const bool = (initial) => new fields.BooleanField({ required: true, initial });
    return {
      schemaVersion: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: CURRENT_SCHEMA_VERSION }),
      status: str({ choices: Object.values(STATUS), initial: STATUS.ARMED }),
      reusable: bool(false),
      revealed: bool(false),
      pending: new fields.ArrayField(new fields.SchemaField({
        tokenUuid: str(),
        movementId: new fields.StringField({ required: true, nullable: true, blank: false, initial: null }),
        userId: str(),
        at: new fields.NumberField({ required: true, nullable: false, initial: 0 })
      }), { required: true, initial: () => [] }),
      rearmSeconds: new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
      lastFired: new fields.SchemaField({
        at: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
        tokenUuids: new fields.ArrayField(str(), { required: true, initial: () => [] }),
        worldTime: new fields.NumberField({ required: true, nullable: true, initial: null })
      }, { required: true, nullable: true, initial: null }),
      trigger: new fields.SchemaField({
        dispositions: new fields.ArrayField(
          new fields.NumberField({ required: true, nullable: false, integer: true }),
          { required: true, initial: () => [DISPOSITIONS.FRIENDLY] }
        ),
        actorTypes: new fields.ArrayField(str(), { required: true, nullable: true, initial: null }),
        includeHidden: bool(false),
        gmMovementTriggers: bool(false)
      }),
      effect: new fields.SchemaField({
        regionId: nullableStr(),
        anchor: str({ choices: ["fixed", "token"], initial: "fixed" }),
        shape: str({ choices: ["line", "cone", "emanation"], initial: "line" }),
        revealSeconds: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 6 }),
        blockedByWalls: bool(false)
      }),
      payload: new fields.SchemaField({
        kind: str({ choices: ["none", "roll", "hazard"], initial: "none" }),
        flavor: new fields.HTMLField({ required: true, initial: "" }),
        soundPath: nullableStr(),
        roll: new fields.SchemaField({
          damage: str({ initial: "" }),
          damageType: str({ initial: "" }),
          save: new fields.SchemaField({
            statistic: str({ initial: "reflex" }),
            dc: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
            basic: bool(true)
          })
        }),
        hazard: new fields.SchemaField({
          actorUuid: nullableStr(),
          itemId: nullableStr()
        })
      }),
      detection: new fields.SchemaField({
        enabled: bool(false),
        regionId: nullableStr(),
        dcSource: str({ choices: ["manual", "hazard"], initial: "manual" }),
        dc: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
        requireSearch: bool(true),
        minRank: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        checked: new fields.ArrayField(str(), { required: true, initial: () => [] })
      })
    };
  }

  /**
   * Runs on EVERY client for every tokenMoveIn on the region. `this` is the behavior system.
   * Never relies on region.hidden (it suppresses all behavior handling).
   * @param {RegionTokenMoveInEvent} event
   * @this {TrapBehaviorType}
   */
  static async #onTokenMoveIn(event) {
    const token = event.data?.token;
    const movement = event.data?.movement;
    if (!token) return;

    const source = this.toObject();
    const state = { ...source, disabled: !!this.behavior.disabled };
    const { eligible } = evaluateEligibility(tokenInput(token), source.trigger, {
      moverIsGM: !!event.user?.isGM,
      gmMovementTriggers: source.trigger.gmMovementTriggers
    });
    const triggerable = canTrigger(state);

    // Mover's client: stop the token just inside the boundary.
    const moverAction = decideMoverAction({
      isSelf: !!event.user?.isSelf,
      hasActiveGM: hasActiveGM(),
      eligible,
      canTrigger: triggerable
    });
    if (moverAction === "stop") token.stopMovement();

    // Active GM's client: validate against documents, then queue.
    if (!isAuthority()) return;
    const service = getTriggerService();
    if (!service) return;
    const movementId = rootMovementId(movement);
    const key = makeTriggerKey(this.behavior.id, token.id, movementId);
    const { tokenExists, insideRegion } = validateTokenInRegion(token, this.region);
    const decision = decideAuthorityAction({
      isActiveGM: true,
      tokenExists,
      insideRegion,
      eligible,
      canTrigger: triggerable,
      isDuplicate: service.hasKey(key)
    });
    service.log.debug("tokenMoveIn", { trap: this.behavior.uuid, token: token.id, movementId, ...decision });
    if (decision.action !== "queue") return;
    service.enqueue(this.behavior, {
      tokenUuid: token.uuid,
      movementId,
      userId: event.user?.id ?? "",
      at: Date.now()
    }, key);
  }

  /** Only tokenMoveIn is handled, regardless of GM configuration (no `events` schema field). */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn
  };
}
