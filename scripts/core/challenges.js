// Pure Victory Counter challenge logic (no Foundry globals). Unit-tested in tests/challenges.test.js.
//
// A "track" here is the plain object Victory Counter stores: { id, title, mode: "progress"|"threshold"|"steps",
// current, status: "running"|"complete", thresholds: [{id, value, label}], steps: [{id, value, label}] }.

export const MAX_TRIGGERS = 3;
export const WHENS = Object.freeze(["reaches", "step", "band", "complete"]);
export const ACTIONS = Object.freeze(["ask", "fire"]);
export const EFFECT_KEYS = Object.freeze(["fired", "noticed", "disabled"]);
export const TRACK_MODES = Object.freeze({ PROGRESS: "progress", THRESHOLD: "threshold", STEPS: "steps" });
export const TRACK_COMPLETE = "complete";

/** Which `when` conditions make sense for a track mode. */
export function whensForMode(mode) {
  switch (mode) {
    case TRACK_MODES.THRESHOLD: return ["band", "complete"];
    case TRACK_MODES.STEPS: return ["reaches", "step", "complete"];
    default: return ["reaches", "complete"];
  }
}

export function defaultChallenge() {
  return {
    triggers: [],
    effects: {
      fired: { trackId: null, delta: 0 },
      noticed: { trackId: null, delta: 0 },
      disabled: { trackId: null, delta: 0 }
    }
  };
}

export function emptyTrigger() {
  return { trackId: null, when: "reaches", value: null, stepId: null, bandId: null, action: "ask" };
}

/** True when the trap has any trigger or any effect configured. */
export function hasChallenge(challenge) {
  if (!challenge) return false;
  if ((challenge.triggers ?? []).some((t) => t?.trackId)) return true;
  return hasEffect(challenge, "fired") || hasEffect(challenge, "noticed") || hasEffect(challenge, "disabled");
}

/** The effect for a key, or null when it has no track or a zero delta. */
export function effectFor(challenge, key) {
  const e = challenge?.effects?.[key];
  if (!e?.trackId) return null;
  const delta = Number(e.delta);
  if (!Number.isInteger(delta) || delta === 0) return null;
  return { trackId: e.trackId, delta };
}

export const hasEffect = (challenge, key) => effectFor(challenge, key) !== null;

/**
 * The threshold band a value sits in: the highest rung whose value it has reached, or null when below every rung.
 * Mirrors Victory Counter's resolveBand (that module is not importable from tests). Does not rely on sort order.
 */
export function resolveBandId(value, thresholds) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  let found = null;
  for (const t of Array.isArray(thresholds) ? thresholds : []) {
    const v = Number(t?.value);
    if (!Number.isFinite(v) || n < v) continue;
    if (!found || v >= Number(found.value)) found = t;
  }
  return found?.id ?? null;
}

const isComplete = (track) => track?.status === TRACK_COMPLETE;

/**
 * Did this one trigger's condition become true between two snapshots of the SAME track?
 * All conditions are edges, so they re-arm on their own:
 * - reaches: prev.current < value <= next.current (progress and steps tracks). Fires again only after the
 *   track has dropped below the value and risen to it again.
 * - step: next lands exactly on the step's value and the value changed (steps tracks). Fires again only after
 *   the track has left that step and come back.
 * - band: the resolved band changes to the trigger's band, in either direction (threshold tracks).
 * - complete: status goes from not complete to complete.
 * A missing prev or next track, or an incomplete trigger, never fires.
 */
export function triggerCrossed(prev, next, trigger) {
  if (!prev || !next || !trigger?.trackId) return false;
  const pc = Number(prev.current);
  const nc = Number(next.current);
  switch (trigger.when) {
    case "reaches": {
      const v = Number(trigger.value);
      if (trigger.value === null || trigger.value === undefined || trigger.value === "" || !Number.isFinite(v)) return false;
      if (next.mode === TRACK_MODES.THRESHOLD) return false;
      return Number.isFinite(pc) && Number.isFinite(nc) && pc < v && v <= nc;
    }
    case "step": {
      if (next.mode !== TRACK_MODES.STEPS || !trigger.stepId) return false;
      const step = (next.steps ?? []).find((s) => s?.id === trigger.stepId);
      if (!step) return false;
      return Number.isFinite(pc) && Number.isFinite(nc) && pc !== nc && nc === Number(step.value);
    }
    case "band": {
      if (next.mode !== TRACK_MODES.THRESHOLD || !trigger.bandId) return false;
      const before = resolveBandId(pc, prev.thresholds);
      const after = resolveBandId(nc, next.thresholds);
      return after === trigger.bandId && before !== trigger.bandId;
    }
    case "complete":
      return !isComplete(prev) && isComplete(next);
    default:
      return false;
  }
}

/**
 * Triggers that fired between two snapshots of the whole track list.
 * @param {object[]} prev  previous tracks
 * @param {object[]} next  new tracks
 * @param {object[]} triggers  a trap's challenge triggers
 * @returns {{index:number, trigger:object, track:object}[]}  `track` is the track as it is now
 */
export function crossedTriggers(prev, next, triggers) {
  const before = new Map((prev ?? []).map((t) => [t?.id, t]));
  const after = new Map((next ?? []).map((t) => [t?.id, t]));
  const out = [];
  (triggers ?? []).slice(0, MAX_TRIGGERS).forEach((trigger, index) => {
    const track = after.get(trigger?.trackId);
    if (track && triggerCrossed(before.get(trigger.trackId), track, trigger)) out.push({ index, trigger, track });
  });
  return out;
}

/**
 * What a crossing "reached", for the GM prompt: { kind, label }. label is the value, the step or band label
 * (falling back to its value), or "" for completion.
 */
export function crossingWhat(trigger, track) {
  switch (trigger?.when) {
    case "reaches": return { kind: "reaches", label: String(trigger.value) };
    case "step": {
      const s = (track?.steps ?? []).find((x) => x?.id === trigger.stepId);
      return { kind: "step", label: String(s?.label || s?.value || "") };
    }
    case "band": {
      const b = (track?.thresholds ?? []).find((x) => x?.id === trigger.bandId);
      return { kind: "band", label: String(b?.label || b?.value || "") };
    }
    default: return { kind: "complete", label: "" };
  }
}

/** Is the trigger's track gone (or no longer able to satisfy the trigger)? True means "track not found". */
export function triggerBroken(trigger, tracks) {
  if (!trigger?.trackId) return false;
  const track = (tracks ?? []).find((t) => t?.id === trigger.trackId);
  if (!track) return true;
  if (trigger.when === "step") return !(track.steps ?? []).some((s) => s?.id === trigger.stepId);
  if (trigger.when === "band") return !(track.thresholds ?? []).some((b) => b?.id === trigger.bandId);
  return false;
}

/** Does any trigger or effect point at a track that does not exist? */
export function challengeBroken(challenge, tracks) {
  if (!challenge) return false;
  const ids = new Set((tracks ?? []).map((t) => t?.id));
  if ((challenge.triggers ?? []).some((t) => triggerBroken(t, tracks))) return true;
  return EFFECT_KEYS.some((k) => challenge.effects?.[k]?.trackId && !ids.has(challenge.effects[k].trackId));
}
