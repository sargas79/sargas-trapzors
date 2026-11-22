// Foundry-dependent. Never import from tests.
// Detection checks, GM-only results, Reveal, and detection area creation (plan A11, section 10).
import { MODULE_ID } from "../core/constants.js";
import { createDeduper } from "../core/dedupe.js";
import { resolveDetectionDC } from "../core/detection.js";
import { detectionKey } from "../core/targets.js";
import { buildDetectionShape, unitsToPixels } from "../core/geometry.js";
import { removeLinkedRegion } from "./linked-regions.js";
import { getAdapter } from "./payload-service.js";
import { postDetectionResult, postDetectionNote } from "./chat.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const SKIP_KEYS = {
  "not-searching": "SARGAS_TRAPZORS.Detection.SkipNotSearching",
  "rank-too-low": "SARGAS_TRAPZORS.Detection.SkipRank",
  "no-perception": "SARGAS_TRAPZORS.Detection.SkipNoPerception",
  "no-dc": "SARGAS_TRAPZORS.Detection.SkipNoDC"
};

let instance = null;
export function getDetectionService() { return instance; }
export function createDetectionService(opts) { instance = new DetectionService(opts); return instance; }

class DetectionService {
  constructor({ log }) {
    this.log = log;
    this.deduper = createDeduper();
    this.warnedUnsupported = false;
  }

  hasKey(key) { return this.deduper.has(key); }

  /** Run one check for a token. Appends the token to `checked` BEFORE rolling so a slow roll cannot double-check. */
  async check(trap, token, key) {
    if (!this.deduper.checkAndAdd(key)) return;
    try {
      await this.#check(trap, { name: token.name, actor: token.actor, key: detectionKey({ tokenUuid: token.uuid }) });
    } catch (err) {
      this.log.error("detection check failed", err);
    }
  }

  /**
   * Theater of the mind: one check per chosen target (TokenDocument or Actor), the same rules as a token
   * entering the detection area. The stored key is the token uuid for a token, else the actor uuid.
   * @param {RegionBehavior} trap
   * @param {(TokenDocument|Actor)[]} targets
   */
  async checkActors(trap, targets) {
    if (!game.user.isActiveGM) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.Notify.NeedActiveGM"));
      return;
    }
    for (const t of targets ?? []) {
      if (!t) continue;
      const isToken = t.documentName === "Token";
      const actor = isToken ? t.actor : t;
      const key = detectionKey({ tokenUuid: isToken ? t.uuid : null, actorUuid: actor?.uuid });
      try {
        await this.#check(trap, { name: t.name, actor, key, reportDuplicate: true });
      } catch (err) {
        this.log.error("detection check failed", err);
      }
    }
  }

  /** @param {{name:string, actor:Actor|null, key:string|null, reportDuplicate?:boolean}} target */
  async #check(trap, { name: tokenName, actor, key, reportDuplicate = false }) {
    const adapter = getAdapter();
    const trapName = trap.region?.name || trap.name;
    const note = (reason) => postDetectionNote(L("SARGAS_TRAPZORS.Detection.Skipped", {
      token: tokenName, trap: trapName, reason: L(SKIP_KEYS[reason] ?? SKIP_KEYS["no-dc"])
    }));

    if (!adapter.capabilities.detection) {
      if (!this.warnedUnsupported) {
        this.warnedUnsupported = true;
        ui.notifications.info(L("SARGAS_TRAPZORS.Detection.Unsupported"));
      }
      return;
    }

    const det = trap.system.detection;
    const payload = trap.system.toObject().payload;
    let hazardDC = null;
    if (det.dcSource === "hazard") {
      try { hazardDC = adapter.getStealthDC({ payload }); } catch (err) { this.log.error("stealth DC failed", err); }
    }
    const dc = resolveDetectionDC({ dcSource: det.dcSource, manualDC: det.dc, hazardDC });
    if (dc == null) { await note("no-dc"); return; }
    if (!key) { await note("no-perception"); return; }

    // Mark checked first (persisted), then roll.
    const checked = [...trap.system.detection.checked];
    if (checked.includes(key)) {
      if (reportDuplicate) await postDetectionNote(L("SARGAS_TRAPZORS.Detection.AlreadyChecked", { token: tokenName, trap: trapName }));
      return;
    }
    await trap.update({ "system.detection.checked": [...checked, key] });

    const res = await adapter.rollDetection({
      actor, dc, requireSearch: det.requireSearch, minRank: det.minRank
    });
    if (res.skipped) {
      // Requirements unmet: do not consume the target's one check; it may retry while searching.
      const fresh = trap.system.detection.checked.filter((u) => u !== key);
      await trap.update({ "system.detection.checked": fresh });
      await note(res.skipped);
      return;
    }
    let disableHTML = "";
    let hazardActor = null;
    if (res.success && payload.kind === "hazard" && payload.hazard?.actorUuid) {
      try {
        hazardActor = await fromUuid(payload.hazard.actorUuid);
        if (hazardActor) disableHTML = adapter.getDisableHTML(hazardActor);
      } catch (err) { this.log.error("disable text failed", err); }
    }
    await postDetectionResult({
      token: tokenName, trapName, trapUuid: trap.uuid, total: res.total, dc, success: !!res.success,
      disableHTML, actor: hazardActor
    });
  }
}

/* ------------------------------------------------------------ */

/** Reveal the trap to players: system.revealed and trigger region visibility ALWAYS. GM only. */
export async function reveal(trap) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  trap = typeof trap === "string" ? fromUuidSync(trap) : trap;
  await trap.update({ "system.revealed": true });
  await trap.region.update({ visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2 });
}

/**
 * Create the GM-only detection region (emanation around the trigger) and link it to the trap.
 * @param {RegionBehavior|string} trap
 * @param {{radiusFt?:number}} [opts]
 */
export async function createDetectionArea(trap, { radiusFt = 10 } = {}) {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
  trap = typeof trap === "string" ? fromUuidSync(trap) : trap;
  const scene = trap.scene;
  const trigger = trap.region;
  await removeLinkedRegion(trap, "detection"); // no orphan from a previous area
  const grid = scene.grid;
  const shape = buildDetectionShape(
    trigger.toObject().shapes, trigger.bounds, unitsToPixels(radiusFt, grid), grid.type !== 0
  );
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: `${trigger.name} (detection)`,
    color: "#2a9dff",
    visibility: CONST.REGION_VISIBILITY?.GAMEMASTER ?? 1,
    ownership: { default: 0 },
    shapes: [shape],
    behaviors: [{ type: `${MODULE_ID}.trapDetection`, system: { trapBehaviorUuid: trap.uuid } }],
    flags: { [MODULE_ID]: { role: "detection", trapRegionId: trigger.id, trapBehaviorId: trap.id } }
  }]);
  await trap.update({ "system.detection.regionId": region.id, "system.detection.enabled": true });
  return region;
}
