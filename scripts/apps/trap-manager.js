// Foundry-dependent. Never import from tests.
// GM-only list of every trap on the viewed scene, with contextual actions.
import { MODULE_ID, TRAP_TYPE } from "../core/constants.js";
import { getLinkStatus, repairLinks, deleteTrap, duplicateTrap } from "../foundry/linked-regions.js";
import { previewEffect } from "../foundry/effect-area.js";
import { getTriggerService } from "../foundry/trigger-service.js";
import { L, statusInfo, trapName, debounce, relativeTime, firstControlledToken } from "./ui-helpers.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const HOOKS = ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior",
  "deleteRegionBehavior", "canvasReady", "controlToken"];

/** Names of the tokens behind a list of token uuids (unknown ones are skipped). */
function tokenNames(uuids) {
  return uuids.map((u) => fromUuidSync(u)?.name).filter(Boolean).join(", ");
}

/** Muted second line of a row, depending on state. */
function subline(b) {
  const s = b.system;
  if (b.disabled) {
    const parts = [L(`SARGAS_TRAPZORS.Config.Kind.${s.payload.kind}`)];
    if (s.reusable) parts.push(L("SARGAS_TRAPZORS.Manager.Reusable"));
    return parts.join(" · ");
  }
  if (s.status === "pending") {
    return L("SARGAS_TRAPZORS.Manager.TriggeredBy", { tokens: tokenNames(s.pending.map((e) => e.tokenUuid)) || "?" });
  }
  if (s.status === "spent") {
    const when = s.lastFired ? relativeTime(s.lastFired.at) : "?";
    const names = s.lastFired ? tokenNames(s.lastFired.tokenUuids) : "";
    return names ? L("SARGAS_TRAPZORS.Manager.FiredOn", { when, tokens: names }) : L("SARGAS_TRAPZORS.Manager.Fired", { when });
  }
  if (s.payload.kind === "hazard" && s.payload.hazard.actorUuid) {
    const actor = fromUuidSync(s.payload.hazard.actorUuid);
    const item = actor?.items?.get(s.payload.hazard.itemId);
    return L("SARGAS_TRAPZORS.Manager.Hazard", { actor: actor?.name ?? "?", item: item?.name ?? "?" });
  }
  return s.reusable ? L("SARGAS_TRAPZORS.Manager.Reusable") : "";
}

/** Area cell: ok / none / broken with label. */
function area(role, status) {
  const label = L(`SARGAS_TRAPZORS.Manager.Area.${role}`);
  return {
    label,
    ok: status === "ok",
    none: status === "none",
    broken: status === "missing" || status === "foreign",
    tooltip: `${label}: ${L(`SARGAS_TRAPZORS.LinkStatus.${status}`)}`
  };
}

/** Contextual primary buttons for a trap. */
function primaryButtons(b, broken) {
  const btn = (action, icon, cls = "") => ({ action, icon, cls, label: L(`SARGAS_TRAPZORS.Manager.Action.${action}`) });
  const out = [];
  if (b.disabled) out.push(btn("enable", "fa-power-off"), btn("edit", "fa-pen-to-square"));
  else if (b.system.status === "pending") out.push(btn("openPrompt", "fa-bell", "st-primary"), btn("test", "fa-flask"), btn("edit", "fa-pen-to-square"));
  else if (b.system.status === "spent") out.push(btn("reset", "fa-rotate-left"), btn("edit", "fa-pen-to-square"));
  else out.push(btn("fire", "fa-bolt", "st-outline"), btn("test", "fa-flask"), btn("edit", "fa-pen-to-square"));
  if (broken) out.push(btn("repair", "fa-wrench", "st-danger"));
  return out;
}

export class TrapManager extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {TrapManager|null} */
  static #instance = null;
  #hookIds = [];
  #menuUuid = null;
  #filter = "";

  /** Open (or focus) the singleton manager. */
  static async open() {
    this.#instance ??= new TrapManager();
    await this.#instance.render({ force: true });
    return this.#instance;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "sargas-trapzors-manager",
    classes: ["sargas-trapzors", "trap-manager"],
    tag: "div",
    position: { width: 860, height: "auto" },
    window: { icon: "fa-solid fa-list", resizable: true },
    actions: {
      fire: this.#act("fire"),
      test: this.#act("test"),
      openPrompt: this.#act("openPrompt"),
      edit: this.#act("edit"),
      reset: this.#act("reset"),
      enable: this.#act("enable"),
      disable: this.#act("disable"),
      repair: this.#act("repair"),
      pan: this.#act("pan"),
      preview: this.#act("preview"),
      duplicate: this.#act("duplicate"),
      delete: this.#act("delete"),
      toggleMenu: this.#onToggleMenu
    }
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/trap-manager.hbs`, scrollable: [".st-rows"] }
  };

  /** @override */
  get title() {
    return L("SARGAS_TRAPZORS.Manager.Title", { scene: canvas.scene?.name ?? "" });
  }

  /** @override */
  _canRender(options) {
    if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
  }

  /** Every trap behavior on the viewed scene. */
  static #traps() {
    const out = [];
    for (const region of canvas.scene?.regions ?? []) {
      for (const b of region.behaviors) if (b.type === TRAP_TYPE) out.push(b);
    }
    return out;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#menuUuid = null; // a re-render replaces the DOM, so any open popover menu is gone
    const token = firstControlledToken();
    const rows = TrapManager.#traps().map((b) => {
      const links = getLinkStatus(b);
      const broken = [links.effect, links.detection].some((s) => s === "missing" || s === "foreign");
      const status = statusInfo(b);
      const name = trapName(b);
      return {
        uuid: b.uuid,
        name,
        key: name.toLowerCase(),
        sub: subline(b),
        status,
        disabled: !!b.disabled,
        revealed: !!b.system.revealed,
        pending: status.key === "pending" && !b.disabled,
        kind: L(`SARGAS_TRAPZORS.Config.Kind.${b.system.payload.kind}`),
        effect: area("effect", links.effect),
        detection: area("detection", links.detection),
        broken,
        buttons: primaryButtons(b, broken),
        menuOpen: this.#menuUuid === b.uuid,
        hidden: !!this.#filter && !name.toLowerCase().includes(this.#filter),
        toggleLabel: L(`SARGAS_TRAPZORS.Manager.Action.${b.disabled ? "enable" : "disable"}`)
      };
    });
    const brokenCount = rows.filter((r) => r.broken).length;
    return Object.assign(context, {
      rows,
      filter: this.#filter,
      hasScene: !!canvas.scene,
      summary: L("SARGAS_TRAPZORS.Manager.Summary", {
        traps: rows.length, pending: rows.filter((r) => r.pending).length, broken: brokenCount
      }),
      anchorChip: token
        ? L("SARGAS_TRAPZORS.Manager.AnchorSelected", { name: token.name })
        : L("SARGAS_TRAPZORS.Manager.AnchorNone"),
      hasAnchor: !!token
    });
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = debounce(() => { if (this.rendered) this.render(); }, 100);
    const sceneId = () => canvas.scene?.id;
    const handler = (doc) => {
      let scene = null;
      if (doc?.documentName === "Region") scene = doc.parent;
      else if (doc?.documentName === "RegionBehavior") scene = doc.parent?.parent;
      if (!scene || scene.id === sceneId()) rerender();
    };
    for (const hook of HOOKS) this.#hookIds.push([hook, Hooks.on(hook, handler)]);

    this.element.addEventListener("input", (event) => {
      if (event.target?.name !== "filter") return;
      this.#filter = event.target.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll(".st-row")) {
        row.hidden = !!this.#filter && !(row.dataset.name ?? "").includes(this.#filter);
      }
    });
    this.element.addEventListener("click", (event) => {
      if (this.#menuUuid && !event.target.closest(".st-menu-wrap")) this.#closeMenu();
    });
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.#menuUuid) { event.stopPropagation(); this.#closeMenu(); }
    });
    // The menu is position:fixed, so close it when the list scrolls or the window is dragged.
    this.element.addEventListener("scroll", (event) => {
      if (this.#menuUuid && !event.target.closest?.(".st-menu")) this.#closeMenu();
    }, true);
    this.element.addEventListener("pointerdown", (event) => {
      if (this.#menuUuid && event.target.closest(".window-header")) this.#closeMenu();
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    TrapManager.#instance = null;
  }

  #closeMenu() {
    this.#menuUuid = null;
    this.element.querySelectorAll(".st-menu").forEach((m) => {
      if (m.matches?.(":popover-open")) m.hidePopover();
    });
    this.element.querySelectorAll("[data-action=toggleMenu]").forEach((b) => b.setAttribute("aria-expanded", "false"));
  }

  static #onToggleMenu(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const open = this.#menuUuid !== uuid;
    this.#closeMenu();
    if (!open) return;
    this.#menuUuid = uuid;
    const menu = target.closest(".st-menu-wrap")?.querySelector(".st-menu");
    if (menu) {
      // A manual popover renders in the top layer: no window, scroll box or backdrop-filter can clip it,
      // and it stays in this app's DOM so data-action clicks still reach the app. Flip up when there's no room below.
      const r = target.getBoundingClientRect();
      menu.style.right = `${window.innerWidth - r.right}px`;
      menu.style.top = `${r.bottom + 4}px`;
      menu.showPopover();
      if (r.bottom + 4 + menu.offsetHeight > window.innerHeight) menu.style.top = `${Math.max(4, r.top - 4 - menu.offsetHeight)}px`;
    }
    target.setAttribute("aria-expanded", "true");
    menu?.querySelector("button")?.focus({ preventScroll: true });
  }

  /** Build an action handler that resolves the row's trap behavior. */
  static #act(name) {
    return async function (event, target) {
      this.#closeMenu();
      const uuid = target.closest("[data-uuid]")?.dataset.uuid;
      const b = uuid ? fromUuidSync(uuid) : null;
      if (!b) return;
      try {
        await TrapManager.#run(name, b);
      } catch (err) {
        console.error(err);
        ui.notifications.error(err.message, { console: false });
      }
    };
  }

  static async #run(name, b) {
    const service = getTriggerService();
    const pending = b.system.status === "pending";
    const token = firstControlledToken()?.document ?? null;
    switch (name) {
      case "edit": return b.sheet.render(true);
      case "fire":
        return pending ? service?.runAction(b.uuid, "fire") : service?.manualFire(b, { token });
      case "test":
        return pending ? service?.runAction(b.uuid, "test") : service?.manualFire(b, { test: true, token });
      case "openPrompt": return service?.openPrompt(b);
      case "reset": return service?.reset(b);
      case "enable": return service?.setEnabled(b, true);
      case "disable": return service?.setEnabled(b, false);
      case "repair": return repairLinks(b);
      case "preview": return previewEffect(b);
      case "duplicate": return duplicateTrap(b);
      case "delete": return deleteTrap(b);
      case "pan": {
        const r = b.region?.bounds;
        if (r) await canvas.animatePan({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
        return;
      }
    }
  }
}
