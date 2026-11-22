// Foundry-dependent. Never import from tests.
// Turning hazard actors (pf2e/sf2e traps, haunts, ...) into configured traps.
import { getAdapter } from "./payload-service.js";
import { createDetectionArea } from "./detection-service.js";
import { getLinkStatus } from "./linked-regions.js";

const FOLDER_NAME = "Sargas Trapzors hazards";
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Fill in a trap from a hazard actor: hazard payload, detection from its Stealth, reuse and re-arm timer.
 * Overwrites the trap's payload kind, detection and lifecycle settings. GM only.
 * @param {RegionBehavior|string} trap
 * @param {Actor|string} actor  a hazard actor (document or uuid)
 * @returns {Promise<object>} the hazard description used
 */
export async function configureTrapFromHazard(trap, actor) {
  if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
  trap = typeof trap === "string" ? await fromUuid(trap) : trap;
  actor = typeof actor === "string" ? await fromUuid(actor) : actor;
  const adapter = getAdapter();
  const info = adapter.capabilities.hazard ? adapter.describeHazard(actor) : null;
  if (!info) throw new Error(L("SARGAS_TRAPZORS.Hazard.NotHazard"));

  await trap.update({
    "system.payload.kind": "hazard",
    "system.payload.hazard.actorUuid": actor.uuid,
    "system.payload.hazard.itemId": info.actionId,
    "system.detection.enabled": true,
    "system.detection.dcSource": "hazard",
    "system.detection.minRank": info.minRank,
    "system.detection.requireSearch": info.minRank > 0, // PF2e: no minimum proficiency means noticeable without Searching
    "system.reusable": info.rearmSeconds != null || info.resetText.trim() !== "",
    "system.rearmSeconds": info.rearmSeconds
  });
  if (!info.actionId) ui.notifications.warn(L("SARGAS_TRAPZORS.Hazard.NoAction", { name: actor.name }));
  if (getLinkStatus(trap).detection === "none") await createDetectionArea(trap, { radiusFt: 10 });
  return info;
}

/** The world folder that holds imported hazards (created on demand). */
async function hazardFolder() {
  const existing = game.folders.find((f) => f.type === "Actor" && f.name === FOLDER_NAME);
  return existing ?? Folder.create({ name: FOLDER_NAME, type: "Actor" });
}

/**
 * The world copy of a compendium hazard: an earlier import (matched by compendium source) or a fresh one.
 * @param {string} uuid  compendium actor uuid
 * @returns {Promise<Actor>}
 */
export async function importHazard(uuid) {
  if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
  const existing = game.actors.find((a) => a.type === "hazard" && a._stats?.compendiumSource === uuid);
  if (existing) return existing;
  const parsed = foundry.utils.parseUuid(uuid);
  const pack = parsed?.collection;
  if (!pack?.documentName || pack.documentName !== "Actor") throw new Error(L("SARGAS_TRAPZORS.Hazard.NotFound"));
  const folder = await hazardFolder();
  const imported = await game.actors.importFromCompendium(pack, parsed.documentId, { folder: folder.id });
  if (!imported) throw new Error(L("SARGAS_TRAPZORS.Hazard.NotFound"));
  return imported;
}
