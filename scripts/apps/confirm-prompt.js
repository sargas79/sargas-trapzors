// Foundry-dependent. Never import from tests.
// GM-only, non-blocking confirm prompt: one DialogV2 per trap uuid (plan section 10).

const { DialogV2 } = foundry.applications.api;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * @typedef {object} PromptData
 * @property {string} trapName
 * @property {string} sceneName
 * @property {string[]} tokenNames
 */

/** DialogV2 has no close callback in its constructor config (only in wait()), so hook _onClose. */
class PromptDialog extends DialogV2 {
  /** @type {() => void} */
  onClosed = () => {};

  /** Mutable prompt body (this.options is frozen after construction). */
  bodyHTML = "";

  /** @override */
  async _renderHTML(context, options) {
    const form = await super._renderHTML(context, options);
    const el = form.querySelector(".dialog-content");
    if (el) el.innerHTML = this.bodyHTML;
    return form;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.onClosed();
  }
}

export class ConfirmPrompt {
  /**
   * @param {string} trapUuid
   * @param {PromptData} data
   * @param {{onAction:(action:"fire"|"test"|"ignore"|"disable")=>Promise<void>|void, onClose:()=>void}} handlers
   */
  constructor(trapUuid, data, { onAction, onClose }) {
    this.trapUuid = trapUuid;
    this.onClose = onClose;
    this.dialog = new PromptDialog({
      id: `sargas-trapzors-prompt-${trapUuid.replace(/[^A-Za-z0-9_-]/g, "-")}`,
      window: { title: game.i18n.localize("SARGAS_TRAPZORS.Prompt.Title") },
      modal: false,
      content: "<p></p>", // non-empty so .dialog-content exists; real body is PromptDialog#bodyHTML
      buttons: [
        { action: "fire", label: "SARGAS_TRAPZORS.Prompt.Fire", icon: "fa-solid fa-bolt", default: true },
        { action: "test", label: "SARGAS_TRAPZORS.Prompt.FireTest", icon: "fa-solid fa-flask" },
        { action: "ignore", label: "SARGAS_TRAPZORS.Prompt.Ignore", icon: "fa-solid fa-ban" },
        { action: "disable", label: "SARGAS_TRAPZORS.Prompt.Disable", icon: "fa-solid fa-power-off" }
      ],
      form: { closeOnSubmit: false },
      // Every action closes the prompt unless it reports otherwise.
      submit: async (result) => {
        const outcome = await onAction(result);
        // "test" and a blocked fire (outcome "keep") leave the trap pending, so the prompt stays open.
        if (result !== "test" && outcome !== "keep") await this.dialog.close();
      }
    });
    this.dialog.bodyHTML = foundry.utils.cleanHTML(ConfirmPrompt.#content(data));
    this.dialog.onClosed = () => this.onClose();
  }

  static #content({ trapName, sceneName, tokenNames }) {
    const l = (k, d) => game.i18n.format(k, d);
    const items = tokenNames.map((n) => `<li>${esc(n)}</li>`).join("");
    return `<p>${esc(l("SARGAS_TRAPZORS.Prompt.Body", { trap: trapName, scene: sceneName }))}</p>`
      + `<p><strong>${esc(game.i18n.localize("SARGAS_TRAPZORS.Prompt.Tokens"))}</strong></p><ul>${items}</ul>`;
  }

  get rendered() { return this.dialog.rendered; }

  /** Show, or refresh in place when the dialog is already open. */
  async show(data) {
    this.dialog.bodyHTML = foundry.utils.cleanHTML(ConfirmPrompt.#content(data));
    await this.dialog.render({ force: true });
  }

  async close() {
    await this.dialog.close();
  }
}
