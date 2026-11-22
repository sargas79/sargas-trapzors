// Foundry-dependent. Never import from tests.
// Complex hazards: when a trap fires it places a hidden hazard token, adds it (and chosen creatures) to the
// scene's encounter and rolls the hazard's initiative; on the hazard's turn the GMs get a routine card.
import { MODULE_ID, TRAP_TYPE, STATUS } from "../core/constants.js";
import { encounterCreatures, routineTargets } from "../core/encounter.js";
import { parseRoutineActions } from "../core/hazard-info.js";
import { decideDelivery } from "../core/payload-text.js";
import { getAdapter } from "./payload-service.js";
import { isAuthority } from "./authority.js";
import { resolveAffectedTokens } from "./effect-area.js";
import { enrichHazardHTML, postDisableChecks } from "./chat.js";
import { applyChallengeEffect } from "./victory-counter.js";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const trapNameOf = (b) => b.region?.name || b.name;
const ACTION = "sargas-trapzors-routine";

/**
 * The linked hazard actor and its routine data, when this trap's hazard is complex and the system supports it.
 * @returns {Promise<{actor:Actor, routine:object, adapter:object}|null>}
 */
async function complexHazard(behavior) {
  const payload = behavior.system.payload;
  if (payload.kind !== "hazard" || !payload.hazard.actorUuid) return null;
  const adapter = getAdapter();
  if (!adapter.capabilities.encounter) return null;
  const actor = await fromUuid(payload.hazard.actorUuid);
  if (!actor || actor.type !== "hazard") return null;
  const routine = adapter.describeRoutine(actor);
  return routine.isComplex ? { actor, routine, adapter } : null;
}

/** The module's hazard token for this trap on its scene, or null. */
function hazardToken(behavior) {
  const id = behavior.system.encounter.tokenId;
  return id ? behavior.scene?.tokens?.get(id) ?? null : null;
}

/** Reuse the module's token, or create a hidden one at the trigger region's centre. */
async function ensureToken(behavior, actor) {
  const existing = hazardToken(behavior);
  if (existing) return existing;
  const scene = behavior.scene;
  const b = behavior.region.bounds;
  const size = scene.grid.size;
  const probe = await actor.getTokenDocument({}, { parent: scene });
  const x = Math.round(b.x + b.width / 2 - (probe.width * size) / 2);
  const y = Math.round(b.y + b.height / 2 - (probe.height * size) / 2);
  const doc = await actor.getTokenDocument({
    x, y, hidden: true, flags: { [MODULE_ID]: { encounterTrap: behavior.uuid } }
  }, { parent: scene });
  const [created] = await scene.createEmbeddedDocuments("Token", [doc.toObject()]);
  return created;
}

/** The scene's active combat, else any combat for the scene, else a new (unstarted) one. */
async function ensureCombat(scene) {
  const linked = game.combats.filter((c) => c.scene?.id === scene.id);
  const found = linked.find((c) => c.active) ?? game.combats.find((c) => c.active && !c.scene) ?? linked[0];
  if (found) return found;
  return getDocumentClass("Combat").create({ scene: scene.id, active: true });
}

/**
 * Start the encounter for a real fire. Never throws.
 * @param {RegionBehavior} behavior  freshly read trap
 * @param {{triggering:TokenDocument[], affected:TokenDocument[], log?:object}} p
 * @returns {Promise<{notes:string[]}>}
 */
export async function startEncounter(behavior, { triggering = [], affected = [], log } = {}) {
  try {
    const link = await complexHazard(behavior);
    if (!link || !behavior.system.payload.hazard.encounter.enabled) return { notes: [] };
    const { actor, adapter } = link;
    const scene = behavior.scene;
    const token = await ensureToken(behavior, actor);
    const combat = await ensureCombat(scene);

    const present = new Set(combat.combatants.map((c) => c.tokenId));
    const byId = new Map([...affected, ...triggering].map((d) => [d.id, d]));
    const ids = (docs) => docs.map((d) => d.id);
    const creatureIds = encounterCreatures({
      mode: behavior.system.payload.hazard.encounter.add,
      affected: ids(affected), triggering: ids(triggering), existing: [...present, token.id]
    });
    const toCreate = [];
    if (!present.has(token.id)) toCreate.push({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId, hidden: true });
    for (const id of creatureIds) {
      const doc = byId.get(id);
      if (doc?.actor && doc.parent?.id === scene.id) {
        toCreate.push({ tokenId: doc.id, sceneId: scene.id, actorId: doc.actorId, hidden: doc.hidden });
      }
    }
    if (toCreate.length) await combat.createEmbeddedDocuments("Combatant", toCreate);

    const combatant = combat.combatants.find((c) => c.tokenId === token.id);
    const initiative = combatant ? await adapter.rollEncounterInitiative(combat, combatant.id) : null;
    await behavior.update({ "system.encounter.tokenId": token.id, "system.encounter.combatId": combat.id });
    // Joining a running encounter can sort the hazard straight onto the current turn without a turn change.
    if (combat.started && combat.combatant?.tokenId === token.id) await postRoutineCard(behavior, token);
    return { notes: [L("SARGAS_TRAPZORS.Encounter.Started", { hazard: actor.name, initiative: initiative ?? "?" })] };
  } catch (err) {
    log?.error("encounter start failed", err);
    return { notes: [L("SARGAS_TRAPZORS.Encounter.StartFailed")] };
  }
}

/** Test fire: whisper GMs what would happen. No token, no combat. Never throws. */
export async function previewEncounter(behavior, { triggering = [], affected = [], log } = {}) {
  try {
    const link = await complexHazard(behavior);
    if (!link || !behavior.system.payload.hazard.encounter.enabled) return;
    const { actor, routine } = link;
    const mode = behavior.system.payload.hazard.encounter.add;
    const ids = (docs) => docs.map((d) => d.id);
    const wanted = new Set(encounterCreatures({ mode, affected: ids(affected), triggering: ids(triggering) }));
    const unique = [...affected, ...triggering].filter((d, i, all) => wanted.has(d.id) && all.findIndex((x) => x.id === d.id) === i);
    const names = [L("SARGAS_TRAPZORS.Encounter.PreviewHazardToken", { hazard: actor.name }), ...unique.map((d) => d.name)];
    const mod = routine.initiativeMod;
    const modText = typeof mod === "number" ? (mod >= 0 ? `+${mod}` : String(mod)) : "?";
    const parts = [
      `<p><strong>${esc(decideDelivery({ test: true }).prefix)}${esc(L("SARGAS_TRAPZORS.Encounter.PreviewTitle", { hazard: actor.name }))}</strong></p>`,
      `<p>${esc(L("SARGAS_TRAPZORS.Encounter.PreviewAdds", { names: names.join(", ") }))}</p>`,
      `<p>${esc(L("SARGAS_TRAPZORS.Encounter.PreviewInitiative", { mod: modText }))}</p>`
    ];
    const count = parseRoutineActions(routine.routineHTML);
    if (count) parts.push(`<p>${esc(L("SARGAS_TRAPZORS.Encounter.CardActions", { count }))}</p>`);
    parts.push(routine.routineHTML.trim()
      ? await enrichHazardHTML(routine.routineHTML, actor)
      : `<p><em>${esc(L("SARGAS_TRAPZORS.Encounter.NoRoutine"))}</em></p>`);
    await ChatMessage.create({
      content: parts.join(""), whisper: gmIds(), speaker: ChatMessage.getSpeaker({ actor })
    });
  } catch (err) {
    log?.error("encounter preview failed", err);
  }
}

/** Delete the hazard combatant and the module's own token (checked by its flag). */
async function removeArtifacts(behavior) {
  const enc = behavior.system.encounter;
  const token = hazardToken(behavior);
  const combat = enc.combatId ? game.combats.get(enc.combatId) : null;
  if (combat && enc.tokenId) {
    const ids = combat.combatants.filter((c) => c.tokenId === enc.tokenId).map((c) => c.id);
    if (ids.length) await combat.deleteEmbeddedDocuments("Combatant", ids);
  }
  if (token && token.getFlag(MODULE_ID, "encounterTrap") === behavior.uuid) await token.delete();
}

/** Remove the hazard's token and combatant and forget the encounter (Reset, deleted combat). Never throws. */
export async function clearEncounter(behavior, { log } = {}) {
  try {
    const enc = behavior.system.encounter;
    if (!enc.tokenId && !enc.combatId) return;
    await removeArtifacts(behavior);
    await behavior.update({ "system.encounter.tokenId": null, "system.encounter.combatId": null });
  } catch (err) {
    log?.error("encounter clean-up failed", err);
  }
}

/**
 * End the hazard: remove it from the encounter, delete the module's token, clear the encounter state. The status
 * stays as the fire left it; with a re-arm timer the timer restarts from now. GM only.
 * @returns {Promise<boolean>} true when an encounter was ended
 */
export async function endHazard(behavior, { log } = {}) {
  if (!game.user.isGM) { ui.notifications.warn(L("SARGAS_TRAPZORS.Encounter.OnlyGM")); return false; }
  try {
    const current = await fromUuid(behavior.uuid);
    const s = current?.system;
    if (!s?.encounter.tokenId && !s?.encounter.combatId) return false;
    const actor = s.payload.hazard.actorUuid ? await fromUuid(s.payload.hazard.actorUuid) : null;
    await removeArtifacts(current);
    const update = { "system.encounter.tokenId": null, "system.encounter.combatId": null };
    if (s.rearmSeconds != null && s.status === STATUS.SPENT && s.lastFired) {
      update["system.lastFired.worldTime"] = game.time.worldTime;
    }
    await current.update(update);
    await ChatMessage.create({
      content: `<p><em>${esc(L("SARGAS_TRAPZORS.Encounter.Ended", { hazard: actor?.name ?? trapNameOf(current) }))}</em></p>`,
      whisper: gmIds()
    });
    await applyChallengeEffect(current, "disabled", { log });
    return true;
  } catch (err) {
    log?.error("end hazard failed", err);
    return false;
  }
}

/* ------------------------------------------------------------ */
/*  Routine card                                                 */
/* ------------------------------------------------------------ */

const button = (op, trapUuid, label, icon, itemId) =>
  `<button type="button" data-action="${ACTION}" data-op="${op}" data-trap-uuid="${esc(trapUuid)}"`
  + `${itemId ? ` data-item-id="${esc(itemId)}"` : ""}><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;

/** Whisper the routine card to the GMs. Never shown to players. */
async function postRoutineCard(behavior, token) {
  const link = await complexHazard(behavior);
  if (!link) return;
  const { actor, routine } = link;
  const count = parseRoutineActions(routine.routineHTML);
  const parts = [`<p><strong>${esc(L("SARGAS_TRAPZORS.Encounter.CardTitle", { hazard: actor.name }))}</strong></p>`];
  if (count) parts.push(`<p>${esc(L("SARGAS_TRAPZORS.Encounter.CardActions", { count }))}</p>`);
  parts.push(routine.routineHTML.trim()
    ? await enrichHazardHTML(routine.routineHTML, actor)
    : `<p><em>${esc(L("SARGAS_TRAPZORS.Encounter.NoRoutine"))}</em></p>`);
  const uuid = behavior.uuid;
  const buttons = [
    ...routine.strikes.map((s) => button("strike", uuid, L("SARGAS_TRAPZORS.Encounter.Strike", { name: s.name }), "fa-crosshairs", s.id)),
    ...routine.actions.map((a) => button("post", uuid, L("SARGAS_TRAPZORS.Encounter.Post", { name: a.name }), "fa-comment", a.id)),
    button("disable", uuid, L("SARGAS_TRAPZORS.Encounter.DisableChecks"), "fa-unlock-keyhole"),
    button("end", uuid, L("SARGAS_TRAPZORS.Encounter.End"), "fa-flag-checkered")
  ];
  parts.push(`<div class="sargas-trapzors-routine-buttons">${buttons.join(" ")}</div>`);
  await ChatMessage.create({
    content: parts.join(""), whisper: gmIds(), speaker: ChatMessage.getSpeaker({ actor, token })
  });
}

/** Tokens a routine strike is rolled against, per {@link routineTargets}. */
async function resolveStrikeTargets(behavior) {
  const scene = behavior.scene;
  const hazardId = behavior.system.encounter.tokenId;
  const keep = (docs) => docs.filter((d) => d && d.id !== hazardId);
  const targeted = keep([...game.user.targets].map((t) => t.document));
  let affected = [];
  try { affected = keep(await resolveAffectedTokens(behavior, hazardToken(behavior))); } catch { affected = []; }
  const inTrigger = keep(scene.tokens.filter((t) => { try { return t.testInsideRegion(behavior.region); } catch { return false; } }));
  const byId = new Map([...inTrigger, ...affected, ...targeted].map((d) => [d.id, d]));
  const ids = (docs) => docs.map((d) => d.id);
  const { ids: chosen } = routineTargets({ targeted: ids(targeted), affected: ids(affected), inTrigger: ids(inTrigger) });
  return chosen.map((id) => byId.get(id));
}

async function note(text) {
  return ChatMessage.create({ content: `<p><em>${esc(text)}</em></p>`, whisper: gmIds() });
}

/** Handle a routine card button on the clicking GM's client. */
async function onRoutineButton(btn, { log } = {}) {
  if (!game.user.isGM) { ui.notifications.warn(L("SARGAS_TRAPZORS.Encounter.OnlyGM")); return; }
  const behavior = await fromUuid(btn.dataset.trapUuid);
  if (!behavior) { ui.notifications.warn(L("SARGAS_TRAPZORS.Encounter.TrapGone")); return; }
  const op = btn.dataset.op;
  if (op === "end") { await endHazard(behavior, { log }); return; }
  const actorUuid = behavior.system.payload.hazard.actorUuid;
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if (!actor) { ui.notifications.warn(L("SARGAS_TRAPZORS.Pf2e.HazardMissingActor")); return; }
  const adapter = getAdapter();
  if (op === "disable") {
    const html = adapter.getDisableHTML(actor);
    if (!String(html).trim()) { ui.notifications.warn(L("SARGAS_TRAPZORS.Hazard.NoDisable")); return; }
    await postDisableChecks({ trapName: trapNameOf(behavior), html, actor });
    return;
  }
  const item = actor.items.get(btn.dataset.itemId);
  if (!item) { ui.notifications.warn(L("SARGAS_TRAPZORS.Pf2e.HazardMissingItem")); return; }
  if (op === "post") {
    await item.toMessage(undefined, { create: true });
  } else if (op === "strike") {
    const targets = await resolveStrikeTargets(behavior);
    const res = await adapter.rollStrike({ actor, item, targets, test: false });
    await note((res?.notes ?? []).join(" "));
  }
}

/* ------------------------------------------------------------ */
/*  Hooks                                                        */
/* ------------------------------------------------------------ */

/** Every trap behavior in every scene. */
function* allTraps() {
  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      for (const b of region.behaviors) if (b.type === TRAP_TYPE) yield b;
    }
  }
}

/** Wire the turn hook, clean-up hooks and routine card buttons. Call once from ready. */
export function registerEncounterHooks({ log } = {}) {
  // Routine card on the hazard's turn (the hook fires on every client; only the active GM posts).
  Hooks.on("combatTurnChange", async (combat, prior, current) => {
    if (!isAuthority() || !current?.combatantId) return;
    try {
      const token = combat.combatants.get(current.combatantId)?.token;
      const trapUuid = token?.getFlag(MODULE_ID, "encounterTrap");
      if (!trapUuid) return;
      const behavior = await fromUuid(trapUuid);
      if (!behavior || behavior.system.encounter.tokenId !== token.id) return;
      await postRoutineCard(behavior, token);
    } catch (err) {
      log?.error("routine card failed", err);
    }
  });

  // The tracked encounter was deleted: remove the hazard token.
  Hooks.on("deleteCombat", async (combat) => {
    if (!isAuthority()) return;
    for (const b of allTraps()) {
      if (b.system.encounter.combatId === combat.id) await clearEncounter(b, { log });
    }
  });

  // The module's token was deleted by hand: forget the encounter so the trap is not stuck.
  Hooks.on("deleteToken", async (token) => {
    if (!isAuthority()) return;
    const trapUuid = token.getFlag(MODULE_ID, "encounterTrap");
    if (!trapUuid) return;
    try {
      const behavior = await fromUuid(trapUuid);
      if (behavior?.system.encounter.tokenId === token.id) {
        await behavior.update({ "system.encounter.tokenId": null, "system.encounter.combatId": null });
      }
    } catch (err) {
      log?.error("token clean-up failed", err);
    }
  });

  // One delegated listener: works for cards rendered before ready (chat history) and in popped-out messages.
  document.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.(`[data-action="${ACTION}"]`);
    if (!btn || !btn.closest(".chat-message")) return;
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    try { await onRoutineButton(btn, { log }); }
    catch (err) { log?.error("routine button failed", err); ui.notifications.error(String(err?.message ?? err)); }
    finally { if (btn.isConnected) btn.disabled = false; }
  });
}
