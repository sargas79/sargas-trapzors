// Pure hazard helpers (no Foundry globals). Unit-tested in tests/hazard-info.test.js.

/** Strip tags and collapse whitespace. */
export function stripHtml(html) {
  return String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/** Action count from a routine such as "(3 actions)" or "(1 action)"; null when none is named. */
export function parseRoutineActions(html) {
  const m = /\((\d+)\s+actions?\)/i.exec(stripHtml(html));
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return n > 0 ? n : null;
}

const RANKS = Object.freeze({ trained: 1, expert: 2, master: 3, legendary: 4 });

/** Minimum proficiency rank named in a stealth details string (0 when none). */
export function parseMinRank(html) {
  const m = /\b(trained|expert|master|legendary)\b/i.exec(stripHtml(html));
  return m ? RANKS[m[1].toLowerCase()] : 0;
}

/** Hazard kind from its traits: haunt > trap > environmental > "other". */
export function hazardKind(traits) {
  const set = new Set((traits ?? []).map((t) => String(t).toLowerCase()));
  if (set.has("haunt")) return "haunt";
  if (set.has("trap")) return "trap";
  if (set.has("environmental")) return "environmental";
  return "other";
}

/**
 * The action that represents the hazard's trigger effect: the first reaction, else the first action.
 * @param {{id:string, type:string, actionType:string|null}[]} items
 * @returns {string|null} item id
 */
export function pickTriggerAction(items) {
  const actions = (items ?? []).filter((i) => i?.type === "action");
  const reaction = actions.find((i) => i.actionType === "reaction");
  return (reaction ?? actions[0])?.id ?? null;
}

const UNIT_SECONDS = Object.freeze({ round: 6, minute: 60, hour: 3600, day: 86400 });
const REARM_RE = /(?:(\d+)|\b(an?|one)\b)\s*(round|minute|hour|day)s?\b|\b(next night|next day|dawn|dusk)\b/i;

/** Game seconds until a hazard resets, parsed from its reset text; null when no timer is named. */
export function parseRearmSeconds(text) {
  const m = REARM_RE.exec(stripHtml(text));
  if (!m) return null;
  if (m[4]) return 86400;
  const n = m[1] !== undefined ? Number.parseInt(m[1], 10) : 1;
  return n * UNIT_SECONDS[m[3].toLowerCase()];
}

/** True when a spent trap's re-arm timer has elapsed. */
export function rearmDue({ status, rearmSeconds, firedWorldTime, now }) {
  return status === "spent"
    && typeof rearmSeconds === "number" && Number.isFinite(rearmSeconds)
    && typeof firedWorldTime === "number" && Number.isFinite(firedWorldTime)
    && typeof now === "number" && now >= firedWorldTime + rearmSeconds;
}

/** Remaining game seconds before re-arm (never negative); null without a timer or fire time. */
export function rearmRemaining({ rearmSeconds, firedWorldTime, now }) {
  if (typeof rearmSeconds !== "number" || typeof firedWorldTime !== "number" || typeof now !== "number") return null;
  return Math.max(0, firedWorldTime + rearmSeconds - now);
}

/** Compact duration such as "1h 30m" or "45s" from seconds. */
export function formatDuration(seconds) {
  let s = Math.max(0, Math.round(seconds));
  if (s === 0) return "0s";
  const parts = [];
  for (const [label, size] of [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]]) {
    const n = Math.floor(s / size);
    if (n > 0) { parts.push(`${n}${label}`); s -= n * size; }
  }
  return parts.slice(0, 2).join(" ");
}
