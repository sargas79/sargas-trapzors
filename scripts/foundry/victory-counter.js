// Foundry-dependent. Never import from tests.
// Optional Victory Counter integration: tracks drive traps (watched on the active GM), traps move tracks.
// Supports both module ids: the released `victory-counter` and the renamed `sargas-victory-counter`.
import { TRAP_TYPE } from "../core/constants.js";
import { crossedTriggers, crossingWhat, effectFor } from "../core/challenges.js";
import { pickTargets } from "../core/targets.js";
import { canTrigger } from "../core/trap-state.js";
import { isAuthority } from "./authority.js";
import { getTriggerService } from "./trigger-service.js";

export const VC_IDS = Object.freeze(["sargas-victory-counter", "victory-counter"]);
export const CHALLENGE_ACTION = "sargas-trapzors-challenge";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
const trapNameOf = (b) => b.region?.name || b.name || "";

/**
 * The first active Victory Counter module that exposes its API, or null.
 * @returns {{id:string, api:object}|null}
 */
export function vcModule() {
  for (const id of VC_IDS) {
    const mod = game.modules?.get(id);
    if (mod?.active && mod.api) return { id, api: mod.api };
  }
  return null;
}

/** All tracks (sanitized copies from Victory Counter), or [] when it is not active. */
export function getTracks() {
  try { return vcModule()?.api.getTracks() ?? []; } catch { return []; }
}

/* ------------------------------------------------------------ */
/*  Trap -> track effects                                        */
/* ------------------------------------------------------------ */

/**
 * Apply a trap's challenge effect ("fired" | "noticed" | "disabled") to its track and tell the GMs. GM clients
 * only; never throws. Test fires must not call this. @returns {Promise<boolean>} true when a track was adjusted
 */
export async function applyChallengeEffect(trap, key, { log } = {}) {
  try {
    const vc = vcModule();
    if (!vc || !game.user?.isGM) return false;
    const effect = effectFor(trap?.system?.challenge, key);
    if (!effect) return false;
    const track = vc.api.getTrack(effect.trackId);
    const trapName = trapNameOf(trap);
    if (!track) {
      await ChatMessage.create({ content: `<p><em>${esc(L("SARGAS_TRAPZORS.Challenge.NoteMissing", { trap: trapName }))}</em></p>`, whisper: gmIds() });
      return false;
    }
    const res = await vc.api.adjust(effect.trackId, effect.delta);
    if (!res) return false;
    const delta = effect.delta > 0 ? `+${effect.delta}` : String(effect.delta);
    await ChatMessage.create({
      content: `<p><em>${esc(L("SARGAS_TRAPZORS.Challenge.NoteAdjusted", {
        track: track.title || track.id, delta, trap: trapName, event: L(`SARGAS_TRAPZORS.Challenge.Event.${key}`)
      }))}</em></p>`,
      whisper: gmIds()
    });
    return true;
  } catch (err) {
    log?.error("challenge effect failed", err);
    return false;
  }
}

/** Trap Manager "Mark disabled": apply the disabled effect only; the trap's state is unchanged. */
export async function markTrapDisabled(trap, { log } = {}) {
  if (!game.user?.isGM) return false;
  const applied = await applyChallengeEffect(trap, "disabled", { log });
  if (!applied) ui.notifications.warn(L("SARGAS_TRAPZORS.Challenge.NothingApplied"));
  return applied;
}

/* ------------------------------------------------------------ */
/*  Track -> trap triggers                                       */
/* ------------------------------------------------------------ */

/** Targets for a challenge fire: party members, else player-owned characters (as actors). */
export function challengeTargets() {
  const input = (a) => ({ uuid: a.uuid, name: a.name, img: a.img ?? null, actorUuid: a.uuid });
  const party = (game.actors.party?.members ?? []).filter(Boolean);
  const owned = game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner);
  const list = party.length ? pickTargets({ party: party.map(input) }) : pickTargets({ owned: owned.map(input) });
  const byUuid = new Map([...party, ...owned].map((a) => [a.uuid, a]));
  return list.map((t) => byUuid.get(t.uuid)).filter(Boolean);
}

/** Every trap behavior on every scene. */
function* allTraps() {
  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      for (const b of region.behaviors) if (b.type === TRAP_TYPE) yield b;
    }
  }
}

/** Fire a trap at the party through the "Fire at..." path. Warns when there is nobody to target. */
export async function fireTrapAtParty(trap) {
  const targets = challengeTargets();
  if (!targets.length) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Challenge.NoTargets", { trap: trapNameOf(trap) }));
    return false;
  }
  await getTriggerService()?.fireAt(trap, { targets });
  return true;
}

/** Whisper a GM-only "fire it?" card with Fire and Ignore buttons. */
async function postAskCard(trap, text) {
  const button = (op, icon, label) => `<button type="button" data-action="${CHALLENGE_ACTION}" data-op="${op}" `
    + `data-trap-uuid="${esc(trap.uuid)}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
  const buttons = `<div class="sargas-trapzors-challenge-buttons">`
    + `${button("fire", "fa-bolt", L("SARGAS_TRAPZORS.Challenge.Fire"))} ${button("ignore", "fa-ban", L("SARGAS_TRAPZORS.Challenge.Ignore"))}</div>`;
  await ChatMessage.create({ content: `<p>${esc(text)}</p>${buttons}`, whisper: gmIds() });
}

/** Handle one trap whose triggers fired for this track change. */
async function handleCrossings(trap, crossings, log) {
  if (trap.disabled) return;
  const state = { ...trap.system.toObject(), disabled: !!trap.disabled };
  if (!canTrigger(state)) return; // spent, in an encounter or disabled: nothing to fire
  const first = crossings[0];
  const what = crossingWhat(first.trigger, first.track);
  const text = L(`SARGAS_TRAPZORS.Challenge.Reached.${what.kind}`, {
    track: first.track.title || first.track.id, what: what.label, trap: trapNameOf(trap)
  });
  if (crossings.some((c) => c.trigger.action === "fire")) {
    await fireTrapAtParty(trap);
    return;
  }
  log?.debug("challenge ask", { trap: trap.uuid, text });
  await postAskCard(trap, text);
  ui.notifications.info(text);
}

/** Chat card button: fire or ignore. GM clients only (the listener checks). */
export async function onChallengeButton(dataset, messageId) {
  const trap = await fromUuid(dataset.trapUuid);
  const message = messageId ? game.messages.get(messageId) : null;
  let outcome = "Ignored";
  if (!trap) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Encounter.TrapGone"));
    outcome = "Gone";
  } else if (dataset.op === "fire") {
    if (!game.user.isActiveGM) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.Notify.NeedActiveGM"));
      return;
    }
    await fireTrapAtParty(trap);
    outcome = "Fired";
  }
  // Replace the buttons so the card cannot be used twice (also after a reload).
  if (message) {
    const done = `<p><em>${esc(L(`SARGAS_TRAPZORS.Challenge.Outcome.${outcome}`))}</em></p>`;
    const content = message.content.replace(/<div class="sargas-trapzors-challenge-buttons">[\s\S]*?<\/div>/, done);
    try { await message.update({ content }); } catch { /* the card stays as it is */ }
  }
}

/**
 * Watch Victory Counter's tracks setting on GM clients; the active GM turns crossings into prompts or fires.
 * Victory Counter fires no hooks of its own: `updateSetting`/`createSetting` on the `<id>.tracks` key is the signal
 * (hook args: Setting document, change, options, userId). Every GM keeps the snapshot so a GM taking over as the
 * active GM does not diff against a stale one. Call once from ready.
 */
export function registerVictoryCounterHooks({ log } = {}) {
  if (!game.user?.isGM || !VC_IDS.some((id) => game.modules?.get(id)?.active)) return;
  /** @type {object[]|null} null until the first snapshot */
  let prev = null;
  let chain = Promise.resolve();
  const keyOf = (vc) => `${vc.id}.tracks`;

  const onChange = (setting) => {
    const vc = vcModule();
    if (!vc || setting?.key !== keyOf(vc)) return;
    const next = vc.api.getTracks();
    const before = prev;
    prev = next;
    if (!before || !isAuthority()) return;
    chain = chain.then(() => processChange(before, next, log)).catch((err) => log?.error("challenge check failed", err));
  };
  Hooks.on("updateSetting", onChange);
  Hooks.on("createSetting", onChange);
  Hooks.on("deleteSetting", (setting) => {
    const vc = vcModule();
    if (vc && setting?.key === keyOf(vc)) prev = [];
  });

  // Victory Counter exposes its API during its own ready hook, which may run after ours: wait for it.
  let tries = 0;
  const init = () => {
    const vc = vcModule();
    if (vc) {
      prev ??= vc.api.getTracks();
      log?.info("Victory Counter integration active", { id: vc.id });
    } else if (++tries < 40) setTimeout(init, 250);
  };
  init();
}

async function processChange(prev, next, log) {
  for (const trap of allTraps()) {
    const triggers = trap.system.challenge?.triggers ?? [];
    if (!triggers.length) continue;
    const crossings = crossedTriggers(prev, next, triggers);
    if (crossings.length) await handleCrossings(trap, crossings, log);
  }
}
