// Foundry-dependent. Never import from tests.
// GM-only list of every trap on the viewed scene, with contextual actions.
import { MODULE_ID, TRAP_TYPE } from "../core/constants.js";
import { getLinkStatus, repairLinks, deleteTrap, duplicateTrap } from "../foundry/linked-regions.js";
import { previewEffect } from "../foundry/effect-area.js";
import { getTriggerService } from "../foundry/trigger-service.js";
import { getAdapter } from "../foundry/payload-service.js";
import { postDisableChecks } from "../foundry/chat.js";
import { endHazard } from "../foundry/hazard-encounter.js";
import { filterHazards, sortHazards } from "../core/hazard-browser.js";
import { rearmRemaining, formatDuration } from "../core/hazard-info.js";
import { L, statusInfo, trapName, debounce, relativeTime, firstControlledToken } from "./ui-helpers.js";
import { createTrapFromHazard } from "./scene-controls.js";
import { FireAtDialog } from "./fire-at-dialog.js";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const HOOKS = ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior",
  "deleteRegionBehavior", "canvasReady", "controlToken", "updateWorldTime"];
const TPL = `modules/${MODULE_ID}/templates`;
const PAGE_SIZE = 100;
const KINDS = ["all", "trap", "haunt", "environmental"];
const COMPLEXITIES = ["all", "simple", "complex"];
const DEFAULT_FILTERS = () => ({ kind: "all", levelMin: "", levelMax: "", complexity: "all", query: "", pack: "all" });

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
    const base = names ? L("SARGAS_TRAPZORS.Manager.FiredOn", { when, tokens: names }) : L("SARGAS_TRAPZORS.Manager.Fired", { when });
    if (s.encounter?.tokenId && s.rearmSeconds != null) return `${base} · ${L("SARGAS_TRAPZORS.Manager.RearmsAfterEncounter")}`;
    const left = rearmRemaining({ rearmSeconds: s.rearmSeconds, firedWorldTime: s.lastFired?.worldTime ?? null, now: game.time.worldTime });
    return left === null ? base : `${base} \u00b7 ${L("SARGAS_TRAPZORS.Manager.RearmsIn", { time: formatDuration(left) })}`;
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
  /** "scene" lists the viewed scene's traps, "all" every scene's. */
  #scope = "scene";
  #filter = "";
  // Compendium tab state. The index itself is cached in the adapter; this is the sorted copy plus UI state.
  #index = null;
  #loading = false;
  #error = null;
  #filters = DEFAULT_FILTERS();
  #limit = PAGE_SIZE;
  #paintToken = 0;

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
    position: { width: 860, height: 680 },
    window: { icon: "fa-solid fa-list", resizable: true },
    actions: {
      fire: this.#act("fire"),
      test: this.#act("test"),
      fireAt: this.#act("fireAt"),
      detectCheck: this.#act("detectCheck"),
      setScope: this.#onSetScope,
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
      disableChecks: this.#act("disableChecks"),
      endHazard: this.#act("endHazard"),
      toggleMenu: this.#onToggleMenu,
      refreshIndex: this.#onRefreshIndex,
      showMore: this.#onShowMore,
      openHazard: this.#onOpenHazard,
      createFromHazard: this.#onCreateFromHazard
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [{ id: "scene" }, { id: "compendium" }],
      initial: "scene",
      labelPrefix: "SARGAS_TRAPZORS.Manager.Tab"
    }
  };

  /** @override */
  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    scene: { template: `${TPL}/trap-manager.hbs`, scrollable: [".st-rows"] },
    compendium: { template: `${TPL}/trap-manager-compendium.hbs`, scrollable: [".st-results"] }
  };

  /** @override */
  get title() {
    return L("SARGAS_TRAPZORS.Manager.Title", { scene: canvas.scene?.name ?? "" });
  }

  /** @override */
  _canRender(options) {
    if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
  }

  /** Every trap behavior on the viewed scene, or on every scene when the scope is "all". */
  #traps() {
    const out = [];
    const scenes = this.#scope === "all" ? game.scenes.contents : [canvas.scene].filter(Boolean);
    for (const scene of scenes) {
      for (const region of scene.regions) {
        for (const b of region.behaviors) if (b.type === TRAP_TYPE) out.push(b);
      }
    }
    return out;
  }

  static #onSetScope(event, target) {
    const scope = target.dataset.scope === "all" ? "all" : "scene";
    if (scope === this.#scope) return;
    this.#scope = scope;
    this.render({ parts: ["scene"] });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.#menuUuid = null; // a re-render replaces the DOM, so any open popover menu is gone
    const token = firstControlledToken();
    const allScenes = this.#scope === "all";
    const rows = this.#traps().map((b) => {
      const links = getLinkStatus(b);
      const broken = [links.effect, links.detection].some((s) => s === "missing" || s === "foreign");
      const status = statusInfo(b);
      const name = trapName(b);
      const onScene = b.scene?.id === canvas.scene?.id;
      return {
        uuid: b.uuid,
        name,
        onScene,
        sceneName: allScenes ? (b.scene?.name ?? "") : "",
        key: name.toLowerCase(),
        sub: subline(b),
        status,
        disabled: !!b.disabled,
        revealed: !!b.system.revealed,
        inEncounter: !!b.system.encounter?.tokenId,
        canDetect: !!getAdapter().capabilities.detection,
        isHazard: b.system.payload.kind === "hazard" && !!b.system.payload.hazard.actorUuid,
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
    const sel = (list, current, key) => list.map((v) => ({ value: v, label: L(`SARGAS_TRAPZORS.Browser.${key}.${v}`), selected: v === current }));
    const packs = new Map((this.#index ?? []).map((e) => [e.pack, e.packTitle]));
    return Object.assign(context, {
      browse: !!getAdapter().capabilities.browse,
      loading: this.#loading,
      error: this.#error,
      filters: this.#filters,
      kinds: sel(KINDS, this.#filters.kind, "Kind"),
      complexities: sel(COMPLEXITIES, this.#filters.complexity, "Complexity"),
      packs: [...packs].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label, selected: value === this.#filters.pack })),
      rows,
      filter: this.#filter,
      hasScene: !!canvas.scene,
      allScenes,
      scopes: ["scene", "all"].map((v) => ({ value: v, on: v === this.#scope, label: L(`SARGAS_TRAPZORS.Manager.Scope.${v}`) })),
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
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const tab = context.tabs?.[partId];
    if (tab) context.tab = tab;
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.tabGroups.primary === "compendium") this.#ensureIndex();
    this.#paintResults().catch((err) => console.error(err));
  }

  /** @override */
  changeTab(tab, group, options = {}) {
    super.changeTab(tab, group, options);
    if (tab === "compendium") this.#ensureIndex();
  }

  /* ------------------------------------------------------------ */
  /*  Compendium tab                                               */
  /* ------------------------------------------------------------ */

  /** Build (or rebuild) the hazard index once, showing the loading state meanwhile. */
  async #ensureIndex(refresh = false) {
    if (!game.user.isGM) return;
    const adapter = getAdapter();
    if (!adapter.capabilities.browse || this.#loading) return;
    if (!refresh && (this.#index || this.#error)) return;
    this.#loading = true;
    this.#error = null;
    if (refresh) this.#index = null;
    if (this.rendered) this.render({ parts: ["compendium"] });
    try {
      this.#index = sortHazards(await adapter.getHazardIndex({ refresh }));
    } catch (err) {
      console.error(err);
      this.#error = err.message;
    }
    this.#loading = false;
    if (this.rendered) this.render({ parts: ["compendium"] });
  }

  /** Render the filtered result list into the results box (no re-index, no filter bar re-render). */
  async #paintResults() {
    const box = this.element?.querySelector(".st-results");
    if (!box) return;
    const token = ++this.#paintToken;
    if (!this.#index || this.#loading) { box.replaceChildren(); return; }
    const adapter = getAdapter();
    const matches = filterHazards(this.#index, this.#filters);
    const shown = matches.slice(0, this.#limit);
    const rows = shown.map((e) => ({
      uuid: e.uuid,
      name: e.name,
      img: e.img,
      packTitle: e.packTitle,
      kind: e.kind,
      kindLabel: L(`SARGAS_TRAPZORS.Browser.Kind.${e.kind}`),
      levelLabel: L("SARGAS_TRAPZORS.Browser.LevelValue", { level: e.level }),
      traits: e.traits.filter((t) => t !== e.kind).slice(0, 3).map((t) => adapter.traitLabel(t)),
      stealth: e.stealthDC === null ? "\u2014" : L("SARGAS_TRAPZORS.Browser.StealthDC", { dc: e.stealthDC })
    }));
    const html = await foundry.applications.handlebars.renderTemplate(`${TPL}/trap-manager-results.hbs`, {
      rows,
      count: L("SARGAS_TRAPZORS.Browser.Count", { shown: shown.length, total: matches.length, all: this.#index.length }),
      hasMore: matches.length > shown.length,
      remaining: matches.length - shown.length
    });
    if (token === this.#paintToken && box.isConnected) box.innerHTML = html;
  }

  static async #onRefreshIndex() { await this.#ensureIndex(true); }

  static #onShowMore() {
    this.#limit += PAGE_SIZE;
    this.#paintResults();
  }

  static async #onOpenHazard(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const doc = uuid ? await fromUuid(uuid) : null;
    if (doc) doc.sheet.render(true);
    else ui.notifications.warn(L("SARGAS_TRAPZORS.Hazard.NotFound"));
  }

  static async #onCreateFromHazard(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    if (!uuid) return;
    try {
      await createTrapFromHazard(uuid);
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    }
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const rerender = debounce(() => { if (this.rendered) this.render({ parts: ["scene"] }); }, 100);
    const sceneId = () => canvas.scene?.id;
    const handler = (doc) => {
      let scene = null;
      if (doc?.documentName === "Region") scene = doc.parent;
      else if (doc?.documentName === "RegionBehavior") scene = doc.parent?.parent;
      if (!scene || this.#scope === "all" || scene.id === sceneId()) rerender();
    };
    for (const hook of HOOKS) this.#hookIds.push([hook, Hooks.on(hook, handler)]);

    const paint = debounce(() => this.#paintResults().catch((err) => console.error(err)), 120);
    const onFilter = (event) => {
      const t = event.target;
      if (!t?.matches?.("[data-cfilter]")) return;
      this.#filters[t.name] = t.value;
      this.#limit = PAGE_SIZE;
      paint();
    };
    this.element.addEventListener("input", onFilter);
    this.element.addEventListener("change", onFilter);
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
      case "fireAt": return FireAtDialog.open(b, "fire");
      case "detectCheck": return FireAtDialog.open(b, "detect");
      case "openPrompt": return service?.openPrompt(b);
      case "reset": return service?.reset(b);
      case "enable": return service?.setEnabled(b, true);
      case "disable": return service?.setEnabled(b, false);
      case "repair": return repairLinks(b);
      case "preview": return b.scene?.id === canvas.scene?.id ? previewEffect(b) : undefined;
      case "disableChecks": {
        const actor = await fromUuid(b.system.payload.hazard.actorUuid);
        const html = actor ? getAdapter().getDisableHTML(actor) : "";
        if (!String(html).trim()) { ui.notifications.warn(L("SARGAS_TRAPZORS.Hazard.NoDisable")); return; }
        return postDisableChecks({ trapName: trapName(b), html, actor });
      }
      case "endHazard": return endHazard(b, { log: service?.log });
      case "duplicate": return duplicateTrap(b);
      case "delete": return deleteTrap(b);
      case "pan": {
        if (b.scene?.id !== canvas.scene?.id) return;
        const r = b.region?.bounds;
        if (r) await canvas.animatePan({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
        return;
      }
    }
  }
}
