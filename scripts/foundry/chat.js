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
export async function postGMSummary({ trapName, triggering, affected, dc, notes, test = false }) {
  const d = buildSummaryData({ trapName, triggering, affected, dc, notes, test });
  const none = L("SARGAS_TRAPZORS.Chat.NobodyAffected");
  const parts = [
    `<p><strong>${esc(d.prefix)}${esc(L("SARGAS_TRAPZORS.Chat.Summary", { trap: d.trapName }))}</strong></p>`,
    `<p>${esc(L("SARGAS_TRAPZORS.Chat.TriggeredBy", { tokens: d.triggeringNames.join(", ") || none }))}</p>`,
    `<p>${esc(L("SARGAS_TRAPZORS.Chat.Affected", { tokens: d.affectedNames.join(", ") || none }))}</p>`
  ];
  if (d.dc != null) parts.push(`<p>${esc(L("SARGAS_TRAPZORS.Chat.DC", { dc: d.dc }))}</p>`);
  for (const n of d.notes) parts.push(`<p><em>${esc(n)}</em></p>`);
  if (d.affectedUuids.length) {
    parts.push(`<button type="button" data-action="sargas-trapzors-select" data-token-uuids="${esc(d.affectedUuids.join(","))}">`
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

/** Wire the Select affected button. Call once from ready. */
export function registerChatHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!game.user.isGM) return;
    html.querySelectorAll('[data-action="sargas-trapzors-select"]').forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        selectTokens((btn.dataset.tokenUuids ?? "").split(",").filter(Boolean));
      });
    });
  });
}
