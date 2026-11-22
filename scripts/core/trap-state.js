import { STATUS } from "./constants.js";

/**
 * Pure decision layer for the trap lifecycle. Never mutates inputs.
 * NOTE: the active GM must compare-and-set against the persisted status before
 * writing the result (plan section 9); this module only decides transitions.
 *
 * @typedef {{tokenUuid:string, movementId:string|null, userId:string, at:number}} PendingEntry
 * @typedef {object} TrapState  A trap system object plus a `disabled` flag.
 * @property {boolean} disabled
 * @property {string} status
 * @property {boolean} reusable
 * @property {PendingEntry[]} pending
 * @property {{at:number, tokenUuids:string[], worldTime:number|null}|null} lastFired
 * @property {{checked:string[]}} detection
 */

const clone = (v) => structuredClone(v);

/** True when a movement trigger may be accepted. */
export function canTrigger(state) {
  return !state.disabled && (state.status === STATUS.ARMED || state.status === STATUS.PENDING);
}

/** True when the trap can no longer fire without a reset. */
export function isTerminal(state) {
  return state.status === STATUS.SPENT;
}

const reject = (state, reason) => ({ ok: false, reason, state });
const accept = (state, effects = []) => ({ ok: true, state, effects });

/**
 * @param {TrapState} state
 * @param {{type:string}} action
 */
export function transition(state, action) {
  switch (action?.type) {
    case "trigger": {
      if (state.disabled) return reject(state, "disabled");
      if (state.status === STATUS.SPENT) return reject(state, "spent");
      if (!canTrigger(state)) return reject(state, "not-triggerable");
      const entry = action.entry;
      const pending = state.pending ?? [];
      const dup = pending.some((e) => e.tokenUuid === entry.tokenUuid && e.movementId === entry.movementId);
      if (dup) return accept(state, []);
      const next = clone(state);
      const wasArmed = state.status === STATUS.ARMED;
      next.status = STATUS.PENDING;
      next.pending = [...clone(pending), clone(entry)];
      return accept(next, [wasArmed ? "promptGM" : "updatePrompt"]);
    }
    case "fire": {
      if (action.test) return accept(state, ["fireTest"]);
      if (state.status === STATUS.SPENT) return reject(state, "spent");
      if (state.disabled) return reject(state, "disabled");
      if (state.status !== STATUS.PENDING && state.status !== STATUS.ARMED) return reject(state, "not-fireable");
      const next = clone(state);
      // A re-arm timer makes even a reusable trap wait (spent) until the timer elapses.
      next.status = state.reusable && state.rearmSeconds == null ? STATUS.ARMED : STATUS.SPENT;
      next.pending = [];
      next.lastFired = { at: action.at, tokenUuids: [...(action.tokenUuids ?? [])], worldTime: action.worldTime ?? null };
      return accept(next, ["fire"]);
    }
    case "ignore": {
      if (state.status !== STATUS.PENDING) return reject(state, "not-pending");
      const next = clone(state);
      next.status = STATUS.ARMED;
      next.pending = [];
      return accept(next, []);
    }
    case "reset": {
      const next = clone(state);
      next.status = STATUS.ARMED;
      next.pending = [];
      next.detection = { ...(next.detection ?? {}), checked: [] };
      return accept(next, []);
    }
    case "disable": {
      const next = clone(state);
      next.disabled = true;
      if (state.status === STATUS.PENDING) {
        next.status = STATUS.ARMED;
        next.pending = [];
      }
      return accept(next, []);
    }
    case "enable": {
      const next = clone(state);
      next.disabled = false;
      return accept(next, []);
    }
    default:
      return reject(state, "unknown-action");
  }
}
