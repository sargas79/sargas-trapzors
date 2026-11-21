// Foundry-dependent (pf2e/sf2e). Never import from tests.
import { TrapAdapter } from "./adapter-api.js";
import { buildDamageFormula, buildCheckSyntax, checkHazardLink } from "../core/pf2e-text.js";
import { buildSaveLine, buildRollFlavor, decideDelivery } from "../core/payload-text.js";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Resolve a hazard link into the actor, item and validation result. */
async function resolveHazard(payload) {
  const actor = payload.hazard?.actorUuid ? await fromUuid(payload.hazard.actorUuid) : null;
  const item = actor && payload.hazard?.itemId ? actor.items?.get(payload.hazard.itemId) ?? null : null;
  const check = checkHazardLink({ actorFound: !!actor, itemFound: !!item, itemType: item?.type });
  return { actor, item, check };
}

const REASON_KEYS = {
  "missing-actor": "SARGAS_TRAPZORS.Pf2e.HazardMissingActor",
  "missing-item": "SARGAS_TRAPZORS.Pf2e.HazardMissingItem",
  "not-an-action": "SARGAS_TRAPZORS.Pf2e.HazardNotAction"
};

export class Pf2eAdapter extends TrapAdapter {
  get id() { return "pf2e"; }
  get capabilities() { return { roll: true, hazard: true, detection: false }; }

  /** @param {import("./adapter-api.js").PayloadContext} ctx */
  async rollPayload({ trapName, payload, test, speaker }) {
    const { roll } = payload;
    const save = roll?.save;
    const dc = save?.dc ?? null;
    const notes = [];
    const d = decideDelivery({ test });
    const whisper = d.whisperToGMs ? gmIds() : undefined;

    // Save request first (public; pf2e settings decide DC visibility). Plain content, no rolls field.
    const checkSyntax = buildCheckSyntax({ statistic: save?.statistic, dc, basic: save?.basic });
    if (checkSyntax) {
      const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(checkSyntax);
      const prefix = d.prefix ? `<strong>${esc(d.prefix.trim())}</strong> ` : "";
      await ChatMessage.create({ speaker, content: prefix + html, ...(whisper ? { whisper } : {}) });
    }

    // Damage card with pf2e's apply buttons.
    const formula = buildDamageFormula(roll?.damage, roll?.damageType);
    if (formula) {
      const DamageRoll = CONFIG.Dice.rolls.find((r) => r.name === "DamageRoll");
      if (!DamageRoll) throw new Error("pf2e DamageRoll class not found");
      const saveLine = buildSaveLine(save, {
        saveTemplate: L("SARGAS_TRAPZORS.Payload.SaveLine"),
        basicSuffix: L("SARGAS_TRAPZORS.Payload.Basic")
      });
      const flavor = d.prefix + buildRollFlavor({ trapName: esc(trapName), damageType: esc(roll.damageType), saveLine });
      const r = new DamageRoll(formula);
      if (d.whisperToGMs) {
        // No `rolls` field, so players get no "privately rolled" placeholder.
        await r.evaluate();
        const content = await r.render();
        await ChatMessage.create({ speaker, flavor, content, whisper });
      } else {
        await r.toMessage({ speaker, flavor });
      }
    }
    return { dc, notes };
  }

  /** @param {import("./adapter-api.js").PayloadContext} ctx */
  async postHazardAction({ payload, test, speaker }) {
    const { item, check } = await resolveHazard(payload);
    if (!check.ok) return { notes: [L(REASON_KEYS[check.reason])] };
    if (!test) {
      await item.toMessage(undefined, { create: true });
      return { notes: [] };
    }
    // Test mode: get the message data without creating it, then whisper plain content to GMs.
    const res = await item.toMessage(undefined, { create: false });
    const data = typeof res?.toObject === "function" ? res.toObject() : foundry.utils.deepClone(res ?? {});
    delete data._id;
    delete data.rolls;
    data.whisper = gmIds();
    data.speaker ??= speaker;
    data.content = `<strong>${esc(decideDelivery({ test }).prefix.trim())}</strong> ${data.content ?? ""}`;
    await ChatMessage.create(data);
    return { notes: [] };
  }

  /** Fails early for a broken hazard link so the trap can stay pending. */
  async validatePayload(payload) {
    if (payload?.kind !== "hazard") return { ok: true };
    const { check } = await resolveHazard(payload);
    if (check.ok) return { ok: true };
    return { ok: false, reason: check.reason, message: L(REASON_KEYS[check.reason]) };
  }

  /** Stealth DC of the linked hazard actor (used by detection in P6). */
  getStealthDC({ payload }) {
    const actor = payload?.hazard?.actorUuid ? fromUuidSync(payload.hazard.actorUuid) : null;
    return actor?.system?.attributes?.stealth?.dc ?? null;
  }
}
