// Foundry-dependent. Never import from tests.
import { buildPublicCardData, buildSummaryData, isEmptyFlavor } from "../core/payload-text.js";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Public flavor card (GM whisper in test mode). Skipped when the flavor is empty. */
export async function postPublicCard({ trapName, flavorHTML, test = false }) {
  if (isEmptyFlavor(flavorHTML)) return null;
  const data = buildPublicCardData({ trapName, flavorHTML, test });
  const content = `${data.prefix ? `<strong>${esc(data.prefix.trim())}</strong> ` : ""}${foundry.utils.cleanHTML(data.flavorHTML)}`;
  const msg = { content, speaker: ChatMessage.getSpeaker({ alias: trapName }) };
  if (data.whisperToGMs) msg.whisper = gmIds();
  return ChatMessage.create(msg);
}

/** GM-only summary: tokens, DC, notes and a Select affected button. */
export async function postGMSummary({ trapName, triggering, affected, dc, notes, test = false, blocked = false }) {
  const d = buildSummaryData({ trapName, triggering, affected, dc, notes, test, blocked });
  const none = L("SARGAS_TRAPZORS.Chat.NobodyAffected");
  const parts = [
    `<p><strong>${esc(d.prefix)}${esc(L(d.headerKey, { trap: d.trapName }))}</strong></p>`,
    `<p>${esc(L("SARGAS_TRAPZORS.Chat.TriggeredBy", { tokens: d.triggeringNames.join(", ") || none }))}</p>`
  ];
  // A blocked fire resolved nothing, so there is no affected line.
  if (!d.blocked) parts.push(`<p>${esc(L("SARGAS_TRAPZORS.Chat.Affected", { tokens: d.affectedNames.join(", ") || none }))}</p>`);
  if (d.dc != null) parts.push(`<p>${esc(L("SARGAS_TRAPZORS.Chat.DC", { dc: d.dc }))}</p>`);
  for (const n of d.notes) parts.push(`<p><em>${esc(n)}</em></p>`);
  // Actor-only targets (Fire at...) have no token to select.
  const selectable = d.affectedUuids.filter((u) => /(^|\.)Token\./.test(u));
  if (selectable.length) {
    parts.push(`<button type="button" data-action="sargas-trapzors-select" data-token-uuids="${esc(selectable.join(","))}">`
      + `<i class="fa-solid fa-crosshairs"></i> ${esc(L("SARGAS_TRAPZORS.Chat.SelectAffected"))}</button>`);
  }
  return ChatMessage.create({ content: parts.join(""), whisper: gmIds(), speaker: ChatMessage.getSpeaker({ alias: trapName }) });
}

/** Select the given tokens on the viewed scene (GM clients only). */
function selectTokens(uuids) {
  const docs = uuids.map((u) => fromUuidSync(u)).filter((t) => t && t.parent === canvas.scene);
  if (!docs.length) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Notify.NoneOnScene"));
    return;
  }
  canvas.tokens.releaseAll();
  for (const t of docs) t.object?.control({ releaseOthers: false });
}

/** Enrich hazard HTML (so @Check links become buttons). @param {string} html @param {Actor} [actor] */
export async function enrichHazardHTML(html, actor) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(String(html ?? ""), { relativeTo: actor ?? undefined });
}

/** Public card with a hazard's disable checks so players can roll them. */
export async function postDisableChecks({ trapName, html, actor }) {
  const body = await enrichHazardHTML(html, actor);
  const content = `<p><strong>${esc(L("SARGAS_TRAPZORS.Hazard.DisableTitle", { trap: trapName }))}</strong></p>${body}`;
  return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ alias: trapName }) });
}

/** GM-only detection result. Plain content (no rolls field), so players see no placeholder. */
export async function postDetectionResult({ token, trapName, trapUuid, total, dc, success, disableHTML = "", actor = null }) {
  const key = success ? "SARGAS_TRAPZORS.Detection.Noticed" : "SARGAS_TRAPZORS.Detection.NotNoticed";
  let content = `<p>${esc(L(key, { token, trap: trapName, total, dc }))}</p>`;
  if (success) {
    content += `<button type="button" data-action="sargas-trapzors-reveal" data-trap-uuid="${esc(trapUuid)}">`
      + `<i class="fa-solid fa-eye"></i> ${esc(L("SARGAS_TRAPZORS.Detection.Reveal"))}</button>`;
  }
  if (success && String(disableHTML).trim()) {
    const body = await enrichHazardHTML(disableHTML, actor);
    content += `<hr><p><strong>${esc(L("SARGAS_TRAPZORS.Hazard.DisableHeading"))}</strong></p>${body}`;
  }
  return ChatMessage.create({ content, whisper: gmIds(), speaker: ChatMessage.getSpeaker({ alias: trapName }) });
}

/** Short GM-only note (skipped checks etc.). */
export async function postDetectionNote(text) {
  return ChatMessage.create({ content: `<p><em>${esc(text)}</em></p>`, whisper: gmIds() });
}

/**
 * Wire chat buttons. Call once from ready. One delegated listener on the document, so buttons on messages
 * rendered before `ready` (the chat history after a reload) and in popped-out messages work too. GM only.
 * @param {{onReveal:(trapUuid:string)=>Promise<void>, onChallenge?:(dataset:DOMStringMap, messageId:string|undefined)=>Promise<void>}} handlers
 */
export function registerChatHooks({ onReveal, onChallenge } = {}) {
  document.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.('[data-action="sargas-trapzors-select"], [data-action="sargas-trapzors-reveal"], [data-action="sargas-trapzors-challenge"]');
    if (!btn || !btn.closest(".chat-message")) return;
    ev.preventDefault();
    if (!game.user?.isGM) return;
    if (btn.dataset.action === "sargas-trapzors-select") {
      selectTokens((btn.dataset.tokenUuids ?? "").split(",").filter(Boolean));
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true;
    if (btn.dataset.action === "sargas-trapzors-challenge") {
      try { await onChallenge?.(btn.dataset, btn.closest(".chat-message")?.dataset.messageId); }
      catch (err) { ui.notifications.error(String(err?.message ?? err)); }
      finally { if (btn.isConnected) btn.disabled = false; }
      return;
    }
    try { await onReveal?.(btn.dataset.trapUuid); }
    catch (err) { btn.disabled = false; ui.notifications.error(String(err?.message ?? err)); }
  });
}
