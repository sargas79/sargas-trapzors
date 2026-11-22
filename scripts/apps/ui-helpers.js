// Foundry-dependent. Never import from tests. Small helpers shared by the trap sheet and manager.
import { TRAP_TYPE } from "../core/constants.js";

/** Localize a key, optionally formatting with data. */
export const L = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** True when `b` is a trap behavior document. */
export const isTrap = (b) => b?.type === TRAP_TYPE;

/** Trap display name (the trigger region's name). */
export const trapName = (b) => b.region?.name || b.name || "";

/** Status key and label for badges. @returns {{key:string, label:string}} */
export function statusInfo(behavior) {
  const key = behavior.system.status;
  return { key, label: L(`SARGAS_TRAPZORS.Status.${key}`) };
}

/** Build `<option>` descriptors with a selected flag. @param {{value:any,label:string}[]} list */
export function options(list, current) {
  return list.map((o) => ({ ...o, selected: String(o.value) === String(current) }));
}

/** Trailing-edge debounce. */
export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Link status descriptor for templates: status key, localized label and flags. */
export function linkView(status) {
  return {
    status,
    label: L(`SARGAS_TRAPZORS.LinkStatus.${status}`),
    none: status === "none",
    ok: status === "ok",
    broken: status === "missing" || status === "foreign"
  };
}

/** Ask the GM to confirm replacing an existing linked area. @returns {Promise<boolean>} */
export async function confirmReplace(roleKey) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("SARGAS_TRAPZORS.Config.ReplaceTitle") },
    content: `<p>${foundry.utils.escapeHTML(L("SARGAS_TRAPZORS.Config.ReplaceBody", { area: L(roleKey).toLowerCase() }))}</p>`,
    rejectClose: false,
    modal: true
  });
  return !!ok;
}

/** First controlled token on the canvas (a Token placeable), or null. */
export function firstControlledToken() {
  return canvas?.tokens?.controlled?.[0] ?? null;
}

/** Localized relative time such as "5 minutes ago". @param {number} ms epoch milliseconds */
export function relativeTime(ms) {
  const diff = (ms - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(game.i18n.lang, { numeric: "auto" });
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), "second");
}
