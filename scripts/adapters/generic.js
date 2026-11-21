// Foundry-dependent (uses Roll, game). Never import from tests.
import { TrapAdapter } from "./adapter-api.js";
import { buildSaveLine, buildRollFlavor, decideDelivery } from "../core/payload-text.js";

export class GenericAdapter extends TrapAdapter {
  get id() { return "generic"; }
  get capabilities() { return { roll: true, hazard: false, detection: false }; }

  /**
   * Evaluate and post the damage formula. The DC is returned for the GM summary only, never put on the card.
   * @param {import("./adapter-api.js").PayloadContext} ctx
   */
  async rollPayload({ trapName, payload, test, speaker }) {
    const { roll } = payload;
    const notes = [];
    const save = roll?.save;
    const dc = save?.dc ?? null;
    if (!roll?.damage?.trim()) return { dc, notes };

    const saveLine = buildSaveLine(save, {
      saveTemplate: game.i18n.localize("SARGAS_TRAPZORS.Payload.SaveLine"),
      basicSuffix: game.i18n.localize("SARGAS_TRAPZORS.Payload.Basic")
    });
    const d = decideDelivery({ test });
    const flavor = d.prefix + buildRollFlavor({
      trapName: foundry.utils.escapeHTML(String(trapName ?? "")),
      damageType: foundry.utils.escapeHTML(String(roll.damageType ?? "")),
      saveLine
    });
    const r = new Roll(roll.damage);
    await r.evaluate();
    if (d.whisperToGMs) {
      // Test mode: a roll message would still show players a "privately rolled" placeholder, so post plain HTML.
      const content = await r.render();
      const whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
      await ChatMessage.create({ speaker, flavor, content, whisper });
    } else {
      await r.toMessage({ speaker, flavor });
    }
    return { dc, notes };
  }
}
