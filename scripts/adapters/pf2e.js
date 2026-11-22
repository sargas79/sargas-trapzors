// Foundry-dependent (pf2e/sf2e). Never import from tests.
import { TrapAdapter } from "./adapter-api.js";
import { buildDamageFormula, buildCheckSyntax, checkHazardLink, strikeTargets, toolbeltTargetFlags } from "../core/pf2e-text.js";
import { checkRequirements, isSuccess } from "../core/detection.js";
import { buildSaveLine, buildRollFlavor, decideDelivery } from "../core/payload-text.js";
import { parseMinRank, hazardKind, pickTriggerAction, parseRearmSeconds } from "../core/hazard-info.js";
import { buildHazardEntry } from "../core/hazard-browser.js";
import { degreeOfSuccess } from "../core/targets.js";

const INDEX_FIELDS = [
  "type", "system.traits.value", "system.details.level.value", "system.details.isComplex", "system.attributes.stealth"
];

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** PF2e Toolbelt Targets Helper flags for the affected tokens; empty when Toolbelt is not active. */
const targetFlags = (affected) =>
  (game.modules.get("pf2e-toolbelt")?.active ? toolbeltTargetFlags((affected ?? []).map((d) => d?.uuid)) : {});

/** Resolve a hazard link into the actor, item and validation result. */
async function resolveHazard(payload) {
  const actor = payload.hazard?.actorUuid ? await fromUuid(payload.hazard.actorUuid) : null;
  const item = actor && payload.hazard?.itemId ? actor.items?.get(payload.hazard.itemId) ?? null : null;
  const check = checkHazardLink({ actorFound: !!actor, itemFound: !!item, itemType: item?.type });
  return { actor, item, check };
}

const DEGREE_KEYS = {
  0: "SARGAS_TRAPZORS.Pf2e.DegreeCritFail",
  1: "SARGAS_TRAPZORS.Pf2e.DegreeFail",
  2: "SARGAS_TRAPZORS.Pf2e.DegreeSuccess",
  3: "SARGAS_TRAPZORS.Pf2e.DegreeCritSuccess"
};

const REASON_KEYS = {
  "missing-actor": "SARGAS_TRAPZORS.Pf2e.HazardMissingActor",
  "missing-item": "SARGAS_TRAPZORS.Pf2e.HazardMissingItem",
  "unsupported-item": "SARGAS_TRAPZORS.Pf2e.HazardUnsupportedItem"
};

export class Pf2eAdapter extends TrapAdapter {
  get id() { return "pf2e"; }
  get capabilities() { return { roll: true, hazard: true, detection: true, browse: true, encounter: true }; }

  /** Session cache of the compendium hazard index; a Promise so concurrent callers share one build. */
  #indexPromise = null;

  /** @param {import("./adapter-api.js").PayloadContext} ctx */
  async rollPayload({ trapName, payload, test, speaker, affected }) {
    const { roll } = payload;
    const save = roll?.save;
    const dc = save?.dc ?? null;
    const notes = [];
    const d = decideDelivery({ test });
    const whisper = d.whisperToGMs ? gmIds() : undefined;
    const flags = targetFlags(affected);

    // Save request first (public; pf2e settings decide DC visibility). Plain content, no rolls field.
    const checkSyntax = buildCheckSyntax({ statistic: save?.statistic, dc, basic: save?.basic });
    if (checkSyntax) {
      const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(checkSyntax);
      const prefix = d.prefix ? `<strong>${esc(d.prefix.trim())}</strong> ` : "";
      await ChatMessage.create({ speaker, flags, content: prefix + html, ...(whisper ? { whisper } : {}) });
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
        await ChatMessage.create({ speaker, flags, flavor, content, whisper });
      } else {
        await r.toMessage({ speaker, flavor, flags });
      }
    }
    return { dc, notes };
  }

  /** @param {import("./adapter-api.js").PayloadContext} ctx */
  async postHazardAction({ payload, test, speaker, affected, triggering }) {
    const { actor, item, check } = await resolveHazard(payload);
    if (!check.ok) return { notes: [L(REASON_KEYS[check.reason])] };
    if (check.kind === "strike") return this.#postHazardStrike({ actor, item, payload, test, affected, triggering });
    // Build the card without creating it, so the affected tokens can be added for PF2e Toolbelt.
    const res = await item.toMessage(undefined, { create: false });
    const data = typeof res?.toObject === "function" ? res.toObject() : foundry.utils.deepClone(res ?? {});
    delete data._id;
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, targetFlags(affected), { inplace: false });
    if (!test) {
      await ChatMessage.create(data);
      return { notes: [] };
    }
    // Test mode: whisper plain content to GMs.
    delete data.rolls;
    data.whisper = gmIds();
    data.speaker ??= speaker;
    data.content = `<strong>${esc(decideDelivery({ test }).prefix.trim())}</strong> ${data.content ?? ""}`;
    await ChatMessage.create(data);
    return { notes: [] };
  }

  /** Payload strike: pick the targets from the trap settings, then roll through {@link rollStrike}. */
  async #postHazardStrike({ actor, item, payload, test, affected, triggering }) {
    const ids = (docs) => (docs ?? []).map((d) => d?.id).filter(Boolean);
    const { ids: targetIds, capped } = strikeTargets({
      affected: ids(affected), triggering: ids(triggering), mode: payload.hazard?.strikeTargets ?? "affected"
    });
    const byId = new Map([...(affected ?? []), ...(triggering ?? [])].map((d) => [d.id, d]));
    // Targets may be TokenDocuments or Actors (theater of the mind); rollStrike handles both.
    return this.rollStrike({ actor, item, targets: targetIds.map((id) => byId.get(id) ?? id), capped, test });
  }

  /**
   * Roll a hazard strike's first variant (no MAP) against each target; the system posts its own attack
   * card with Damage / Critical buttons. Damage is never applied automatically. Shared by the payload and the
   * routine card. `targets` are TokenDocuments, Actors (theater of the mind) or ids (reported as missing); at most
   * 10 are rolled.
   * Options (pf2e 14.370 StrikeData variants[0].roll, pf2e.mjs ~20418): `target` (Token object), `event`.
   * The dialog is skipped through a synthetic event (eventToRollParams, pf2e.mjs ~13752: shiftKey flips the
   * showCheckDialogs default). Test mode rolls with `createMessage: false` and whispers a summary to GMs.
   * pf2e needs a placed Token object as the target, so only tokens on the firing GM's viewed scene are rolled
   * against. An Actor, or a token that is not on the viewed scene, is rolled with no target (public card with
   * no degree) and the module works out the degree against the actor's AC and whispers it to GMs; in test mode
   * the roll posts no message at all. Without a `target` pf2e falls back to the user's first targeted token
   * (pf2e.mjs ~20421), so the GM's targets are cleared for those rolls and restored afterwards.
   * @param {{actor:Actor, item:Item, targets:(TokenDocument|Actor|string)[], test?:boolean, capped?:boolean}} p
   * @returns {Promise<{notes:string[]}>}
   */
  async rollStrike({ actor, item, targets, test = false, capped = false }) {
    const notes = [];
    const strike = actor.system?.actions?.find((a) => a.type === "strike" && a.item?.id === item.id);
    const variant = strike?.variants?.[0];
    if (!variant?.roll) return { notes: [L("SARGAS_TRAPZORS.Pf2e.StrikeMissing")] };
    const unique = [...new Map((targets ?? []).map((t) => [typeof t === "string" ? t : t?.uuid ?? t?.id, t])).values()];
    if (!unique.length) return { notes: [L("SARGAS_TRAPZORS.Pf2e.StrikeNoTargets")] };
    const max = 10;
    const list = unique.slice(0, max);
    capped ||= unique.length > max;
    // shiftKey flips pf2e's showCheckDialogs default, so the roll dialog is always skipped.
    const event = { shiftKey: !!game.user.settings?.showCheckDialogs, ctrlKey: false, metaKey: false };
    const gmLines = [];
    let rolled = 0;
    for (const doc of list) {
      if (typeof doc === "string") {
        notes.push(L("SARGAS_TRAPZORS.Pf2e.StrikeOffScene", { name: esc(doc) }));
        continue;
      }
      const isActor = doc.documentName === "Actor";
      const token = isActor ? null : doc.object;
      const onScene = !!token && doc.parent?.id === canvas.scene?.id;
      const targetActor = isActor ? doc : doc.actor;
      if (!onScene && !targetActor) {
        notes.push(L("SARGAS_TRAPZORS.Pf2e.StrikeOffScene", { name: esc(doc.name ?? "?") }));
        continue;
      }
      try {
        if (onScene) {
          if (!test) {
            await variant.roll({ target: token, event });
          } else {
            // Test mode: roll without a chat message (a GM-only pf2e roll would show players a
            // "privately rolled" placeholder) and whisper a plain summary line to GMs instead.
            const roll = await variant.roll({ target: token, event, createMessage: false });
            gmLines.push(this.#strikeLine(item, doc.name, roll?.total, this.#armorClass(targetActor), roll?.degreeOfSuccess));
          }
        } else {
          const roll = await this.#rollWithoutTarget(variant, { event, createMessage: test ? false : undefined });
          const ac = this.#armorClass(targetActor);
          const die = roll?.dice?.find((d) => d.faces === 20)?.total ?? null;
          const dos = degreeOfSuccess({ total: roll?.total, dc: ac, die });
          gmLines.push(this.#strikeLine(item, doc.name, roll?.total, ac, dos));
        }
        rolled++;
      } catch (err) {
        console.error("sargas-trapzors | strike roll failed", err);
        notes.push(L("SARGAS_TRAPZORS.Pf2e.StrikeFailed", { name: esc(doc.name) }));
      }
    }
    if (gmLines.length) {
      const prefix = test ? `<p><strong>${esc(decideDelivery({ test }).prefix.trim())}</strong></p>` : "";
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        whisper: gmIds(),
        content: `${prefix}<ul>${gmLines.map((l) => `<li>${l}</li>`).join("")}</ul>`
      });
    }
    notes.unshift(L("SARGAS_TRAPZORS.Pf2e.StrikeRolled", { count: rolled }));
    if (capped) notes.push(L("SARGAS_TRAPZORS.Pf2e.StrikeCapped", { max }));
    return { notes };
  }

  #armorClass(actor) {
    const ac = actor?.armorClass?.value ?? actor?.system?.attributes?.ac?.value;
    return typeof ac === "number" ? ac : null;
  }

  #strikeLine(item, targetName, total, ac, degree) {
    return L("SARGAS_TRAPZORS.Pf2e.StrikeTestLine", {
      strike: esc(item.name), target: esc(targetName), total: total ?? "?", ac: ac ?? "?",
      result: L(DEGREE_KEYS[degree] ?? "SARGAS_TRAPZORS.Pf2e.DegreeUnknown")
    });
  }

  /** Roll a strike variant with no target: the GM's targeted tokens are released for the roll, then restored. */
  async #rollWithoutTarget(variant, { event, createMessage }) {
    const targeted = [...(game.user.targets ?? [])].map((t) => t.id);
    if (targeted.length) canvas.tokens?.setTargets([]);
    try {
      return await variant.roll({ event, ...(createMessage === false ? { createMessage: false } : {}) });
    } finally {
      if (targeted.length) canvas.tokens?.setTargets(targeted);
    }
  }

  /**
   * What the routine card needs from a hazard actor: routine HTML, strikes, non-passive actions, Stealth modifier.
   * Hazard strikes are "melee" items (pf2e stores ranged ones as "melee" too); passive actions are left out.
   * @param {Actor} actor
   */
  describeRoutine(actor) {
    const items = actor?.items?.contents ?? [];
    return {
      isComplex: !!actor?.system?.details?.isComplex,
      routineHTML: String(actor?.system?.details?.routine ?? ""),
      strikes: items.filter((i) => i.type === "melee").map((i) => ({ id: i.id, name: i.name })),
      actions: items
        .filter((i) => i.type === "action" && i.system?.actionType?.value !== "passive")
        .map((i) => ({ id: i.id, name: i.name })),
      initiativeMod: actor?.initiative?.mod ?? null
    };
  }

  /**
   * Roll the hazard combatant's initiative (Stealth) without a dialog and without moving the turn marker.
   * Rolls actor.initiative (Stealth for complex hazards) directly; its
   * statistic roll honours `skipDialog` (pf2e.mjs ~19353); a hidden combatant rolls GM-only (pf2e.mjs ~34970).
   * @param {Combat} combat
   * @param {string} combatantId
   * @returns {Promise<number|null>}
   */
  async rollEncounterInitiative(combat, combatantId) {
    // Rolled with no chat message: a hidden combatant's GM-only roll would show players a
    // "privately rolled some dice" placeholder. ActorInitiative#roll (pf2e.mjs ~34970) still sets the tracker value,
    // and the GM summary reports the result.
    const combatant = combat.combatants.get(combatantId);
    const res = await combatant?.actor?.initiative?.roll({ combatant, skipDialog: true, createMessage: false });
    const value = res?.roll?.total ?? combat.combatants.get(combatantId)?.initiative;
    return typeof value === "number" ? value : null;
  }

  /** Fails early for a broken hazard link so the trap can stay pending. */
  async validatePayload(payload) {
    if (payload?.kind !== "hazard") return { ok: true };
    const { check } = await resolveHazard(payload);
    if (check.ok) return { ok: true };
    return { ok: false, reason: check.reason, message: L(REASON_KEYS[check.reason]) };
  }

  /**
   * Blind Perception check for detection. Posts nothing (createMessage:false); the caller whispers the result.
   * Degree comes from CheckRoll#degreeOfSuccess (getter over options.degreeOfSuccess, null without a DC).
   * @returns {Promise<{skipped:string}|{total:number, degree:number|null, success:boolean}>}
   */
  async rollDetection({ actor, dc, requireSearch = true, minRank = 0 }) {
    if (!actor?.perception) return { skipped: "no-perception" };
    const isSearching = !!actor.system.exploration?.some((id) => actor.items.get(id)?.slug === "search");
    const req = checkRequirements({ requireSearch, isSearching, minRank, rank: actor.perception.rank ?? 0 });
    if (!req.ok) return { skipped: req.reason };
    const roll = await actor.perception.roll({ dc: { value: dc }, skipDialog: true, createMessage: false });
    const degree = roll.degreeOfSuccess ?? roll.options?.degreeOfSuccess ?? null;
    return { total: roll.total, degree, success: isSuccess(degree) };
  }

  /** Raw disable HTML of a hazard actor. */
  getDisableHTML(actor) {
    return String(actor?.system?.details?.disable ?? "");
  }

  /** Localised trait name via the system's hazard trait labels, falling back to the slug. */
  traitLabel(slug) {
    const key = CONFIG.PF2E?.hazardTraits?.[slug];
    return key ? game.i18n.localize(key) : String(slug);
  }

  /**
   * Everything trap configuration needs from a hazard actor. Null for a non-hazard.
   * @param {Actor} actor
   */
  describeHazard(actor) {
    if (!actor || actor.type !== "hazard") return null;
    const sys = actor.system ?? {};
    const details = sys.details ?? {};
    const items = (actor.items?.contents ?? []).map((i) => ({
      id: i.id, type: i.type, actionType: i.system?.actionType?.value ?? null
    }));
    const dc = sys.attributes?.stealth?.dc;
    const resetText = String(details.reset ?? "");
    const level = Number(details.level?.value);
    return {
      kind: hazardKind(sys.traits?.value),
      level: Number.isFinite(level) ? level : 0,
      isComplex: !!details.isComplex,
      stealthDC: typeof dc === "number" && Number.isFinite(dc) ? dc : null,
      minRank: parseMinRank(sys.attributes?.stealth?.details),
      actionId: pickTriggerAction(items),
      disableHTML: this.getDisableHTML(actor),
      resetText,
      rearmSeconds: parseRearmSeconds(resetText)
    };
  }

  /**
   * Every hazard in every Actor compendium. Built once per session; `refresh` rebuilds.
   * @param {{refresh?:boolean}} [opts]
   * @returns {Promise<import("../core/hazard-browser.js").HazardEntry[]>}
   */
  getHazardIndex({ refresh = false } = {}) {
    if (refresh || !this.#indexPromise) {
      this.#indexPromise = this.#buildIndex().catch((err) => { this.#indexPromise = null; throw err; });
    }
    return this.#indexPromise;
  }

  async #buildIndex() {
    const packs = game.packs.filter((p) => p.documentName === "Actor");
    const perPack = await Promise.all(packs.map(async (pack) => {
      try {
        const index = await pack.getIndex({ fields: INDEX_FIELDS });
        return index.filter((rec) => rec.type === "hazard").map((rec) => buildHazardEntry(rec, pack));
      } catch (err) {
        console.warn(`sargas-trapzors | could not index ${pack.collection}`, err);
        return [];
      }
    }));
    return perPack.flat();
  }

  /** Stealth DC of the linked hazard actor (used by detection in P6). */
  getStealthDC({ payload }) {
    const actor = payload?.hazard?.actorUuid ? fromUuidSync(payload.hazard.actorUuid) : null;
    return actor?.system?.attributes?.stealth?.dc ?? null;
  }
}
