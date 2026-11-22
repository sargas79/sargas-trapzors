// Foundry-dependent. Never import from tests.
// Theater of the mind: pick targets, then fire a trap at them or run a detection check for them.
import { MODULE_ID } from "../core/constants.js";
import { pickTargets } from "../core/targets.js";
import { getTriggerService } from "../foundry/trigger-service.js";
import { getDetectionService } from "../foundry/detection-service.js";
import { L, trapName } from "./ui-helpers.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const TPL = `modules/${MODULE_ID}/templates`;

const asInput = (doc, actorUuid) => ({ uuid: doc.uuid, name: doc.name, img: doc.img ?? doc.texture?.src ?? null, actorUuid });

/** Target options for the picker: party members, player-owned characters, then targeted or controlled tokens. */
function gatherTargets(chosen = []) {
  const party = (game.actors.party?.members ?? []).map((a) => asInput(a, a.uuid));
  const owned = game.actors
    .filter((a) => a.type === "character" && a.hasPlayerOwner)
    .map((a) => asInput(a, a.uuid));
  const tokenDocs = new Map();
  for (const t of [...(game.user.targets ?? []), ...(canvas?.tokens?.controlled ?? [])]) {
    if (t?.document) tokenDocs.set(t.document.uuid, t.document);
  }
  const tokens = [...tokenDocs.values()].map((d) => asInput(d, d.baseActor?.uuid ?? d.actor?.uuid ?? null));
  return pickTargets({ party, owned, tokens, chosen });
}

export class FireAtDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {{trap:RegionBehavior, mode:"fire"|"detect"}} opts */
  constructor({ trap, mode = "fire", ...options } = {}) {
    super(options);
    this.trap = trap;
    this.mode = mode;
  }

  /** Open the picker for a trap. @param {RegionBehavior} trap @param {"fire"|"detect"} mode */
  static open(trap, mode = "fire") {
    if (!game.user.isGM) return null;
    const app = new FireAtDialog({ trap, mode, id: `sargas-trapzors-fire-at-${mode}-${trap.id}` });
    app.render({ force: true });
    return app;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sargas-trapzors", "fire-at"],
    tag: "div",
    position: { width: 420, height: "auto" },
    window: { icon: "fa-solid fa-bullseye", resizable: true },
    actions: { confirm: this.#onConfirm, cancel: this.#onCancel }
  };

  /** @override */
  static PARTS = {
    body: { template: `${TPL}/fire-at-dialog.hbs` }
  };

  /** @override */
  get title() {
    const key = this.mode === "detect" ? "SARGAS_TRAPZORS.FireAt.TitleDetect" : "SARGAS_TRAPZORS.FireAt.TitleFire";
    return L(key, { trap: trapName(this.trap) });
  }

  /** @override */
  _canRender(options) {
    if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const kindLabel = { party: "Party", owned: "Owned", token: "Token" };
    const targets = gatherTargets(this.#checkedUuids()).map((t) => ({ ...t, kindLabel: L(`SARGAS_TRAPZORS.FireAt.Kind.${kindLabel[t.kind]}`) }));
    return Object.assign(context, {
      fire: this.mode === "fire",
      targets,
      hasTargets: targets.length > 0,
      confirmLabel: L(this.mode === "fire" ? "SARGAS_TRAPZORS.FireAt.Fire" : "SARGAS_TRAPZORS.FireAt.Check"),
      confirmIcon: this.mode === "fire" ? "fa-bolt" : "fa-magnifying-glass"
    });
  }

  /** Targets currently checked in the DOM (kept across re-renders). */
  #checkedUuids() {
    return [...(this.element?.querySelectorAll("input[name=target]:checked") ?? [])].map((i) => i.value);
  }

  static async #onConfirm() {
    const uuids = this.#checkedUuids();
    if (!uuids.length) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.FireAt.NoneChosen"));
      return;
    }
    const docs = (await Promise.all(uuids.map((u) => fromUuid(u)))).filter(Boolean);
    if (!docs.length) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.FireAt.NoneChosen"));
      return;
    }
    const test = !!this.element.querySelector("input[name=test]")?.checked;
    const trap = await fromUuid(this.trap.uuid);
    if (!trap) return;
    await this.close();
    if (this.mode === "fire") await getTriggerService()?.fireAt(trap, { targets: docs, test });
    else await getDetectionService()?.checkActors(trap, docs);
  }

  static async #onCancel() { await this.close(); }
}
