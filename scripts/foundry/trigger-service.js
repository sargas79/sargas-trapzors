// Foundry-dependent. Never import from tests.
// Runs on the active GM only: batches validated triggers, persists them, shows the confirm prompt.
import { TRAP_TYPE } from "../core/constants.js";
import { createDeduper, createBatcher } from "../core/dedupe.js";
import { transition } from "../core/trap-state.js";
import { STATUS } from "../core/constants.js";
import { ConfirmPrompt } from "../apps/confirm-prompt.js";
import { isAuthority } from "./authority.js";
import { fireEffect } from "./effect-area.js";
import { runPayload, validateFirePayload } from "./payload-service.js";
import { postGMSummary } from "./chat.js";

let instance = null;

/** @returns {TriggerService|null} */
export function getTriggerService() { return instance; }

export function createTriggerService(opts) {
  instance = new TriggerService(opts);
  return instance;
}

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

  /** Effect area, payload and GM summary. Never throws: failures become summary notes. */
  async #resolveFire(behavior, entries, test) {
    const L = (k) => game.i18n.localize(k);
    const notes = [];
    const trapName = behavior.region?.name || behavior.name;
    const triggering = [];
    for (const e of entries) {
      const doc = await fromUuid(e.tokenUuid);
      if (doc) triggering.push(doc);
    }
    let affected = [];
    try {
      const res = await fireEffect(behavior, triggering[0] ?? null, { test });
      if (!res.configured) notes.push(L("SARGAS_TRAPZORS.Chat.NoEffectArea"));
      affected = res.affected;
    } catch (err) {
      this.log.error("effect resolution failed", err);
      notes.push(L("SARGAS_TRAPZORS.Chat.EffectFailed"));
    }
    let dc = null;
    try {
      const res = await runPayload(behavior, { affected, triggering, test, log: this.log });
      dc = res.dc;
      notes.push(...res.notes);
    } catch (err) {
      this.log.error("payload failed", err);
      notes.push(L("SARGAS_TRAPZORS.Chat.PayloadFailed"));
    }
    try {
      await postGMSummary({ trapName, triggering, affected, dc, notes, test });
    } catch (err) {
      this.log.error("summary failed", err);
    }
  }

  /** Warn the GM and post a summary note when the payload is invalid. @returns {Promise<boolean>} true if blocked */
  async #blockedByValidation(behavior, entries, test = false) {
    const res = await validateFirePayload(behavior, this.log);
    if (res.ok) return false;
    ui.notifications.warn(res.message);
    try {
      const triggering = [];
      for (const e of entries) { const d = await fromUuid(e.tokenUuid); if (d) triggering.push(d); }
      await postGMSummary({
        trapName: behavior.region?.name || behavior.name, triggering, affected: [], dc: null,
        notes: [res.message, game.i18n.localize("SARGAS_TRAPZORS.Chat.StillPending")], test, blocked: true
      });
    } catch (err) { this.log.error("validation summary failed", err); }
    return true;
  }

  /** @returns {Promise<"keep"|void>} "keep" leaves the prompt open. */
  async #onAction(uuid, action) {
    try {
      if (!isAuthority()) return;
      const behavior = await fromUuid(uuid);
      if (!behavior) return;
      const state = TriggerService.#stateOf(behavior);
      const L = (k, d) => game.i18n.format(k, d);

      switch (action) {
        case "fire": {
          if (await this.#blockedByValidation(behavior, state.pending)) return "keep";
          const tokenUuids = state.pending.map((e) => e.tokenUuid);
          const r = transition(state, { type: "fire", at: Date.now(), tokenUuids });
          if (!r.ok) {
            ui.notifications.warn(L("SARGAS_TRAPZORS.Notify.CannotFire", { reason: r.reason }));
            return;
          }
          await behavior.update({
            "system.status": r.state.status,
            "system.pending": r.state.pending,
            "system.lastFired": r.state.lastFired
          });
          await this.#resolveFire(behavior, state.pending, false);
          break;
        }
        case "test": {
          const r = transition(state, { type: "fire", test: true });
          if (!r.ok) return;
          if (await this.#blockedByValidation(behavior, state.pending, true)) return "keep";
          await this.#resolveFire(behavior, state.pending, true);
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
  /* Public GM actions (Trap Manager). All require the active GM.   */

  /** Warn and return false unless this client is the active GM. */
  #requireAuthority() {
    if (game.user.isActiveGM) return true;
    ui.notifications.warn(game.i18n.localize("SARGAS_TRAPZORS.Notify.NeedActiveGM"));
    return false;
  }

  /**
   * Run a prompt action ("fire" | "test" | "ignore" | "disable") on a pending trap, exactly like the prompt buttons.
   * @param {string} uuid
   * @param {"fire"|"test"|"ignore"|"disable"} action
   */
  async runAction(uuid, action) {
    if (!this.#requireAuthority()) return;
    return this.#onAction(uuid, action);
  }

  /**
   * Fire (or test-fire) a trap that is not pending. Test fire changes no state.
   * @param {RegionBehavior} behavior
   * @param {{token?:TokenDocument|null, test?:boolean}} [opts]
   */
  async manualFire(behavior, { token = null, test = false } = {}) {
    if (!this.#requireAuthority()) return;
    try {
      const uuid = behavior.uuid;
      const current = await fromUuid(uuid);
      if (!current) return;
      const entries = token ? [{ tokenUuid: token.uuid, movementId: null, userId: game.user.id, at: Date.now() }] : [];
      if (await this.#blockedByValidation(current, entries, test)) return;
      if (test) {
        await this.#resolveFire(current, entries, true);
        return;
      }
      const state = TriggerService.#stateOf(current);
      const r = transition(state, { type: "fire", at: Date.now(), tokenUuids: entries.map((e) => e.tokenUuid) });
      if (!r.ok) {
        ui.notifications.warn(game.i18n.format("SARGAS_TRAPZORS.Notify.CannotFire", { reason: r.reason }));
        return;
      }
      const fresh = await fromUuid(uuid);
      if (!fresh) return;
      if (fresh.system.status !== state.status || fresh.system.pending.length !== state.pending.length) {
        ui.notifications.warn(game.i18n.localize("SARGAS_TRAPZORS.Notify.StateChanged"));
        return;
      }
      await fresh.update({
        "system.status": r.state.status,
        "system.pending": r.state.pending,
        "system.lastFired": r.state.lastFired
      });
      await this.#resolveFire(fresh, entries, false);
    } catch (err) {
      this.log.error("manual fire failed", err);
    }
  }

  /** Reset a trap to armed: clears pending and detection checks. Closes its open prompt. */
  async reset(behavior) {
    if (!this.#requireAuthority()) return;
    try {
      const current = await fromUuid(behavior.uuid);
      if (!current) return;
      const r = transition(TriggerService.#stateOf(current), { type: "reset" });
      await current.update({
        "system.status": r.state.status,
        "system.pending": r.state.pending,
        "system.detection.checked": r.state.detection.checked
      });
      await this.prompts.get(behavior.uuid)?.close();
    } catch (err) {
      this.log.error("reset failed", err);
    }
  }

  /** Enable or disable a trap. Disabling clears pending and closes its prompt. */
  async setEnabled(behavior, on) {
    if (!this.#requireAuthority()) return;
    try {
      const current = await fromUuid(behavior.uuid);
      if (!current) return;
      const r = transition(TriggerService.#stateOf(current), { type: on ? "enable" : "disable" });
      const update = { disabled: r.state.disabled };
      if (!on) {
        update["system.status"] = r.state.status;
        update["system.pending"] = r.state.pending;
      }
      await current.update(update);
      if (!on) await this.prompts.get(behavior.uuid)?.close();
    } catch (err) {
      this.log.error("setEnabled failed", err);
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
