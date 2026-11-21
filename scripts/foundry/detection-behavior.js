// Foundry-dependent. Never import from tests.
import { makeTriggerKey } from "../core/dedupe.js";
import { evaluateEligibility } from "../core/eligibility.js";
import { rootMovementId } from "../core/movement.js";
import { decideDetection } from "../core/detection.js";
import { isAuthority, validateTokenInRegion, tokenEligibilityInput } from "./authority.js";
import { getDetectionService } from "./detection-service.js";

const fields = foundry.data.fields;

/**
 * Region behavior sub-type "sargas-trapzors.trapDetection". Never stops movement.
 * Only the active GM acts; all validation uses document state.
 */
export default class DetectionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  /** @override */
  static LOCALIZATION_PREFIXES = ["SARGAS_TRAPZORS.Behavior.trapDetection", "BEHAVIOR.TYPES.base"];

  /** @override */
  static defineSchema() {
    return {
      trapBehaviorUuid: new fields.StringField({ required: true, nullable: true, blank: false, initial: null })
    };
  }

  /** @this {DetectionBehaviorType} */
  static async #onTokenMoveIn(event) {
    if (!isAuthority()) return;
    const token = event.data?.token;
    const service = getDetectionService();
    if (!token || !service) return;

    const trap = this.trapBehaviorUuid ? fromUuidSync(this.trapBehaviorUuid) : null;
    const sys = trap?.system;
    const eligible = !!trap && evaluateEligibility(tokenEligibilityInput(token), sys.trigger, {
      moverIsGM: !!event.user?.isGM,
      gmMovementTriggers: sys.trigger.gmMovementTriggers
    }).eligible;
    const { tokenExists, insideRegion } = validateTokenInRegion(token, this.region);
    const movementId = rootMovementId(event.data.movement);
    const key = makeTriggerKey(this.behavior.id, token.id, movementId);

    const decision = tokenExists && insideRegion
      ? decideDetection({
        isActiveGM: true,
        trapExists: !!trap,
        trapDisabled: !!trap?.disabled,
        detectionEnabled: !!sys?.detection.enabled,
        status: sys?.status,
        revealed: !!sys?.revealed,
        eligible,
        alreadyChecked: !!sys?.detection.checked.includes(token.uuid),
        isDuplicate: service.hasKey(key)
      })
      : { action: "ignore", reason: tokenExists ? "outside-region" : "token-missing" };
    service.log.debug("detection tokenMoveIn", { detection: this.behavior.uuid, token: token.id, ...decision });
    if (decision.action !== "check") return;
    await service.check(trap, token, key);
  }

  /** Only tokenMoveIn is handled. */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn
  };
}
