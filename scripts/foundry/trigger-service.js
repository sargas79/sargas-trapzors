// Foundry-dependent. Never import from tests.
// Runs on the active GM only: batches validated triggers, persists them, shows the confirm prompt.
import { TRAP_TYPE } from "../core/constants.js";
import { createDeduper, createBatcher } from "../core/dedupe.js";
import { transition } from "../core/trap-state.js";
import { STATUS } from "../core/constants.js";
import { ConfirmPrompt } from "../apps/confirm-prompt.js";
import { isAuthority } from "./authority.js";
import { fireEffect } from "./effect-area.js";

let instance = null;

/** @returns {TriggerService|null} */
export function getTriggerService() { return instance; }

export function createTriggerService(opts) {
  instance = new TriggerService(opts);
  return instance;
}

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

class TriggerService {
  /** @param {{log: ReturnType<typeof import("./logger.js").createLogger>}} opts */
  constructor({ log }) {
    this.log = log;
    this.deduper = createDeduper();
    this.batcher = createBatcher({
      windowMs: 300,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t),
      onFlush: (uuid, entries) => { this.#flush(uuid, entries).catch((err) => this.log.error("flush failed", err)); }
    });
    /** @type {Map<string, ConfirmPrompt>} */
    this.prompts = new Map();
  }

  hasKey(key) { return this.deduper.has(key); }

  /** Queue a validated trigger. Marks the dedupe key immediately. */
  enqueue(behavior, entry, key) {
    if (!this.deduper.checkAndAdd(key)) return;
    this.batcher.add(behavior.uuid, entry);
  }

  /* ------------------------------------------------------------ */

  static #stateOf(behavior) {
    return { ...behavior.system.toObject(), disabled: !!behavior.disabled };
  }

  /** Apply entries, then compare-and-set persist. Retries once if the persisted state changed under us. */
  async #flush(uuid, entries) {
    if (!isAuthority()) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      const behavior = await fromUuid(uuid);
      if (!behavior) return;
      const before = TriggerService.#stateOf(behavior);
      let next = before;
      let changed = false;
      for (const entry of entries) {
        const r = transition(next, { type: "trigger", entry });
        if (r.ok) { if (r.state !== next) changed = true; next = r.state; }
      }
      if (changed) {
        // Re-read immediately before writing; abort this attempt if status/pending moved.
        const fresh = await fromUuid(uuid);
        if (!fresh) return;
        if (fresh.system.status !== before.status || fresh.system.pending.length !== before.pending.length) {
          this.log.debug("flush CAS mismatch, retrying", { uuid, attempt });
          continue;
        }
        await fresh.update({ "system.status": next.status, "system.pending": next.pending });
      }
      if (next.status === STATUS.PENDING && !next.disabled) await this.openPrompt(behavior);
      return;
    }
    this.log.warn("flush aborted after retry (state kept changing)", uuid);
  }

  /* ------------------------------------------------------------ */

  async #promptData(behavior) {
    const names = [];
    for (const e of behavior.system.pending) {
      const doc = await fromUuid(e.tokenUuid);
      names.push(doc?.name ?? e.tokenUuid);
    }
    return {
      trapName: behavior.region?.name || behavior.name,
      sceneName: behavior.scene?.name ?? "",
      tokenNames: names
    };
  }

  /** Open the prompt for a pending trap, or refresh the existing one. */
  async openPrompt(behavior) {
    if (!isAuthority()) return;
    const uuid = behavior.uuid;
    const data = await this.#promptData(behavior);
    let prompt = this.prompts.get(uuid);
    if (!prompt) {
      prompt = new ConfirmPrompt(uuid, data, {
        onAction: (action) => this.#onAction(uuid, action),
        onClose: () => { if (this.prompts.get(uuid) === prompt) this.prompts.delete(uuid); }
      });
      this.prompts.set(uuid, prompt);
    }
    await prompt.show(data);
  }

  async closeAllPrompts() {
    const all = [...this.prompts.values()];
    this.prompts.clear();
    for (const p of all) await p.close();
  }

  /* ------------------------------------------------------------ */

  async #whisper(content) {
    const whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
    return ChatMessage.create({ content, whisper });
  }

  async #tokenNames(entries) {
    const names = [];
    for (const e of entries) names.push((await fromUuid(e.tokenUuid))?.name ?? e.tokenUuid);
    return names;
  }

  /** Resolve/reveal the effect area; returns the extra whisper line (HTML-escaped plain text). */
  async #effectLine(behavior, entries, test) {
    const L = (k, d) => game.i18n.format(k, d);
    try {
      const anchor = entries[0] ? await fromUuid(entries[0].tokenUuid) : null;
      const res = await fireEffect(behavior, anchor, { test });
      if (!res.configured) return esc(game.i18n.localize("SARGAS_TRAPZORS.Chat.NoEffectArea"));
      const names = res.affected.map((t) => t.name).join(", ")
        || game.i18n.localize("SARGAS_TRAPZORS.Chat.NobodyAffected");
      return esc(L("SARGAS_TRAPZORS.Chat.Affected", { tokens: names }));
    } catch (err) {
      this.log.error("effect resolution failed", err);
      return esc(game.i18n.localize("SARGAS_TRAPZORS.Chat.EffectFailed"));
    }
  }

  async #onAction(uuid, action) {
    try {
      if (!isAuthority()) return;
      const behavior = await fromUuid(uuid);
      if (!behavior) return;
      const state = TriggerService.#stateOf(behavior);
      const name = behavior.region?.name || behavior.name;
      const L = (k, d) => game.i18n.format(k, d);

      switch (action) {
        case "fire": {
          const tokenUuids = state.pending.map((e) => e.tokenUuid);
          const r = transition(state, { type: "fire", at: Date.now(), tokenUuids });
          if (!r.ok) return ui.notifications.warn(L("SARGAS_TRAPZORS.Notify.CannotFire", { reason: r.reason }));
          const names = await this.#tokenNames(state.pending);
          await behavior.update({
            "system.status": r.state.status,
            "system.pending": r.state.pending,
            "system.lastFired": r.state.lastFired
          });
          const line = await this.#effectLine(behavior, state.pending, false);
          await this.#whisper(`${esc(L("SARGAS_TRAPZORS.Chat.Fired", { trap: name, tokens: names.join(", ") }))}<br>${line}`);
          break;
        }
        case "test": {
          const r = transition(state, { type: "fire", test: true });
          if (!r.ok) return;
          const names = await this.#tokenNames(state.pending);
          const line = await this.#effectLine(behavior, state.pending, true);
          await this.#whisper(`${esc(L("SARGAS_TRAPZORS.Chat.FiredTest", { trap: name, tokens: names.join(", ") }))}<br>${line}`);
          // No state change; the prompt stays open (ConfirmPrompt keeps it open for "test").
          break;
        }
        case "ignore": {
          const r = transition(state, { type: "ignore" });
          if (!r.ok) return;
          await behavior.update({ "system.status": r.state.status, "system.pending": r.state.pending });
          break;
        }
        case "disable": {
          const r = transition(state, { type: "disable" });
          await behavior.update({ disabled: true, "system.status": r.state.status, "system.pending": r.state.pending });
          break;
        }
      }
    } catch (err) {
      this.log.error("prompt action failed", action, err);
    }
  }

  /* ------------------------------------------------------------ */

  /** Reopen prompts for every trap still pending (ready, and when GM authority may have changed). */
  async recover() {
    if (!isAuthority()) { await this.closeAllPrompts(); return; }
    for (const scene of game.scenes) {
      for (const region of scene.regions) {
        for (const behavior of region.behaviors) {
          if (behavior.type !== TRAP_TYPE || behavior.disabled) continue;
          if (behavior.system.status === STATUS.PENDING && behavior.system.pending.length) {
            this.log.debug("recovering prompt", behavior.uuid);
            await this.openPrompt(behavior);
          }
        }
      }
    }
  }
}
