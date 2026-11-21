// Foundry-dependent. Never import from tests.
import { selectAdapter } from "../adapters/registry.js";
import { GenericAdapter } from "../adapters/generic.js";
import { postPublicCard } from "./chat.js";

const generic = new GenericAdapter();
// P5b replaces these two entries with the pf2e/sf2e adapter.
const REGISTRY = { generic, bySystem: { pf2e: generic, sf2e: generic } };

let warned = false;

/** Select the adapter for the current system; shows a one-time GM info notice for unsupported systems. */
export function getAdapter() {
  const sel = selectAdapter(game.system.id, REGISTRY);
  if (!sel.supported && !warned && game.user.isGM) {
    warned = true;
    ui.notifications.info(game.i18n.format("SARGAS_TRAPZORS.Notify.GenericPayloads", { system: game.system.id }));
  }
  return sel.adapter;
}

/**
 * Dispatch the payload. Never throws; failures are logged and returned as notes.
 * @returns {Promise<{dc:number|null, notes:string[]}>}
 */
export async function runPayload(behavior, { affected, triggering, test, log }) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
  const notes = [];
  let dc = null;
  const adapter = getAdapter();
  const payload = behavior.system.toObject().payload;
  const trapName = behavior.region?.name || behavior.name;
  const ctx = { behavior, trapName, payload, affected, triggering, test, speaker: ChatMessage.getSpeaker({ alias: trapName }) };

  try { await postPublicCard({ trapName, flavorHTML: payload.flavor, test }); }
  catch (err) { log?.error("flavor card failed", err); notes.push(L("SARGAS_TRAPZORS.Chat.PayloadFailed")); }

  if (payload.soundPath) {
    try {
      // Broadcast to all clients unless testing (GM-only, local).
      foundry.audio.AudioHelper.play({ src: payload.soundPath, volume: 0.8, loop: false }, !test);
    } catch (err) { log?.error("sound failed", err); notes.push(L("SARGAS_TRAPZORS.Chat.PayloadFailed")); }
  }

  try {
    if (payload.kind === "roll") {
      if (adapter.capabilities.roll) {
        const res = await adapter.rollPayload(ctx);
        dc = res?.dc ?? null;
        notes.push(...(res?.notes ?? []));
      } else notes.push(L("SARGAS_TRAPZORS.Chat.NotSupported"));
    } else if (payload.kind === "hazard") {
      if (adapter.capabilities.hazard) {
        const res = await adapter.postHazardAction(ctx);
        notes.push(...(res?.notes ?? []));
      } else notes.push(L("SARGAS_TRAPZORS.Chat.NotSupported"));
    }
  } catch (err) {
    log?.error("payload failed", err);
    notes.push(L("SARGAS_TRAPZORS.Chat.PayloadFailed"));
  }
  return { dc, notes };
}
