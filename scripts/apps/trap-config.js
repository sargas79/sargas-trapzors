// Foundry-dependent. Never import from tests.
// Sheet for the trap RegionBehavior: Effect / Payload / Lifecycle / Detection tabs. GM only.
import { MODULE_ID } from "../core/constants.js";
import { formToTrapUpdate, trapToFormContext, splitRearm, REARM_UNITS, ALLOWED_DISPOSITIONS, ANCHORS, SHAPES, SAVE_STATS, DC_SOURCES } from "../core/trap-form.js";
import { rearmRemaining, formatDuration } from "../core/hazard-info.js";
import { configureTrapFromHazard } from "../foundry/hazard-traps.js";
import { getAdapter } from "../foundry/payload-service.js";
import { createEffectArea, setBlockedByWalls, previewEffect, getEffectRegion, resolveEffectShapes } from "../foundry/effect-area.js";
import { jb2aRoot, presetAvailable, playAnimation } from "../foundry/animations.js";
import { ANIMATION_PRESETS, ANIMATION_GROUPS, ANIMATION_MODES, presetsByGroup } from "../core/animation-presets.js";
import { createDetectionArea, reveal } from "../foundry/detection-service.js";
import { getLinkStatus, repairLinks } from "../foundry/linked-regions.js";
import { getTriggerService } from "../foundry/trigger-service.js";
import { L, statusInfo, options as toOptions, debounce, linkView, confirmReplace, trapName, relativeTime, firstControlledToken } from "./ui-helpers.js";

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api;
const TPL = `modules/${MODULE_ID}/templates`;
const DISPOSITION_KEYS = { "-2": "secret", "-1": "hostile", "0": "neutral", "1": "friendly" };
const RANKS = [0, 1, 2, 3, 4];
const RANK_KEYS = ["untrained", "trained", "expert", "master", "legendary"];

export class TrapConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /** Unsaved form values kept across re-renders (null when clean). */
  #draft = null;
  /** True once the user has edited the form since the last save. */
  #dirty = false;
  #hookIds = [];

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["sargas-trapzors", "trap-config"],
    position: { width: 600, height: "auto" },
    window: { icon: "fa-solid fa-triangle-exclamation", contentClasses: ["standard-form"], resizable: true },
    form: { handler: this.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      placeEffect: this.#onPlaceEffect,
      previewEffect: this.#onPreview,
      previewAnimation: this.#onPreviewAnimation,
      browseAnimation: this.#onBrowseAnimation,
      repairLinks: this.#onRepair,
      resetTrap: this.#onReset,
      createDetection: this.#onCreateDetection,
      revealTrap: this.#onReveal,
      testFire: this.#onTestFire,
      browseSound: this.#onBrowseSound,
      configureFromHazard: this.#onConfigureFromHazard
    }
  };

  /** @override */
  static TABS = {
    primary: {
      tabs: [{ id: "effect" }, { id: "payload" }, { id: "lifecycle" }, { id: "detection" }],
      initial: "effect",
      labelPrefix: "SARGAS_TRAPZORS.Config.Tab"
    }
  };

  /** @override */
  static PARTS = {
    header: { template: `${TPL}/trap-config-header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    effect: { template: `${TPL}/trap-config-effect.hbs`, scrollable: [""] },
    payload: { template: `${TPL}/trap-config-payload.hbs`, scrollable: [""] },
    lifecycle: { template: `${TPL}/trap-config-lifecycle.hbs`, scrollable: [""] },
    detection: { template: `${TPL}/trap-config-detection.hbs`, scrollable: [""] },
    footer: { template: `${TPL}/trap-config-footer.hbs` }
  };

  /** @override GM only. */
  _canRender(options) {
    if (!game.user.isGM) throw new Error(L("SARGAS_TRAPZORS.Config.GMOnly"));
    return super._canRender(options);
  }

  /** @override */
  get isEditable() {
    return game.user.isGM && super.isEditable;
  }

  /** @override */
  get title() {
    return `${L("SARGAS_TRAPZORS.Behavior.trap.label")}: ${trapName(this.document)}`;
  }

  /* ------------------------------------------------------------ */
  /*  Form data                                                    */
  /* ------------------------------------------------------------ */

  /** Current system data in form shape (what the inputs would hold if nothing was edited). */
  #baseValues() {
    const b = this.document;
    const s = b.system.toObject();
    const ctx = trapToFormContext(s);
    return {
      name: trapName(b),
      enabled: !b.disabled,
      reusable: s.reusable,
      rearm: splitRearm(s.rearmSeconds),
      trigger: {
        dispositions: ALLOWED_DISPOSITIONS.filter((d) => ctx.dispositions[d]).map(String),
        actorTypes: s.trigger.actorTypes ?? [],
        includeHidden: s.trigger.includeHidden,
        gmMovementTriggers: s.trigger.gmMovementTriggers
      },
      effect: { ...s.effect },
      payload: foundry.utils.deepClone(s.payload),
      detection: { ...s.detection },
      detectionRadius: 10
    };
  }

  /** Expand raw form data over the stored values; empty checkbox groups mean "none checked". */
  #collect(raw) {
    const form = foundry.utils.expandObject(raw);
    const base = this.#baseValues();
    const data = foundry.utils.mergeObject(base, form, { inplace: false });
    data.trigger.dispositions = form.trigger?.dispositions ?? [];
    data.trigger.actorTypes = form.trigger?.actorTypes ?? [];
    return data;
  }

  #captureDraft() {
    const el = this.element;
    const form = el instanceof HTMLFormElement ? el : el?.querySelector("form");
    if (!form) return;
    this.#draft = this.#collect(new foundry.applications.ux.FormDataExtended(form).object);
  }

  /** Allowed payload kinds for the current adapter (plus the stored kind so an old value can still be saved). */
  #allowedKinds() {
    const caps = getAdapter().capabilities;
    const kinds = ["none"];
    if (caps.roll) kinds.push("roll");
    if (caps.hazard) kinds.push("hazard");
    const stored = this.document.system.payload.kind;
    if (!kinds.includes(stored)) kinds.push(stored);
    return kinds;
  }

  /**
   * Validate and save the form. Shows notifications on failure.
   * @param {object} [raw] flat form data; read from the live form when omitted
   * @returns {Promise<boolean>} true when saved
   */
  async #save(raw) {
    if (!this.isEditable) return false;
    if (!raw) {
      const el = this.element;
      const form = el instanceof HTMLFormElement ? el : el?.querySelector("form");
      if (!form) return false;
      raw = new foundry.applications.ux.FormDataExtended(form).object;
    }
    const data = this.#collect(raw);
    const res = formToTrapUpdate(data, { allowedKinds: this.#allowedKinds() });
    if (!res.ok) {
      ui.notifications.error(res.errors.map((e) => L(e.key)).join(" "), { console: false });
      return false;
    }
    const b = this.document;
    const wasEnabled = !b.disabled;
    try {
      await b.update({ ...res.update, disabled: !res.enabled });
      const region = b.region;
      if (res.name && region && res.name !== region.name) await region.update({ name: res.name });
      if (res.blockedByWalls !== !!b.system.effect.blockedByWalls) await setBlockedByWalls(b, res.blockedByWalls);
      // Disabling a pending trap also clears its pending triggers and prompt.
      if (wasEnabled && !res.enabled) await getTriggerService()?.setEnabled(b, false);
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
      return false;
    }
    this.#draft = null;
    this.#dirty = false;
    await this.render();
    return true;
  }

  static async #onSubmit(event, form, formData) {
    await this.#save(formData.object);
  }

  /* ------------------------------------------------------------ */
  /*  Context                                                      */
  /* ------------------------------------------------------------ */

  /** @override */
  async _prepareContext(options) {
    if (this.rendered && this.#dirty) this.#captureDraft();
    else this.#draft = null;
    const context = await super._prepareContext(options);
    const b = this.document;
    const v = this.#draft ?? this.#baseValues();
    const caps = getAdapter().capabilities;
    const links = getLinkStatus(b);
    const status = statusInfo(b);
    const editable = this.isEditable;

    const kindList = this.#allowedKinds().map((k) => ({ value: k, label: L(`SARGAS_TRAPZORS.Config.Kind.${k}`) }));
    const selectedTypes = new Set(v.trigger.actorTypes ?? []);
    const typeIds = new Set([...game.documentTypes.Actor.filter((t) => t !== "base"), ...selectedTypes]);
    const actorTypes = [...typeIds].map((t) => ({
      value: t,
      label: CONFIG.Actor.typeLabels?.[t] ? L(CONFIG.Actor.typeLabels[t]) : t,
      checked: selectedTypes.has(t)
    }));
    const checkedDisp = new Set((v.trigger.dispositions ?? []).map(String));
    const dispositions = ALLOWED_DISPOSITIONS.map((d) => ({
      value: d,
      label: L(`SARGAS_TRAPZORS.Config.Disposition.${DISPOSITION_KEYS[d]}`),
      checked: checkedDisp.has(String(d))
    }));

    return Object.assign(context, {
      editable,
      trapName: v.name,
      status,
      disabled: !v.enabled,
      revealed: b.system.revealed,
      pending: b.system.status === "pending",
      v,
      shapes: toOptions(SHAPES.map((s) => ({ value: s, label: L(`SARGAS_TRAPZORS.Config.Shape.${s}`) })), v.effect.shape),
      anchors: toOptions(ANCHORS.map((a) => ({ value: a, label: L(`SARGAS_TRAPZORS.Config.Anchor.${a}`) })), v.effect.anchor),
      kinds: toOptions(kindList, v.payload.kind),
      isRoll: v.payload.kind === "roll",
      isHazard: v.payload.kind === "hazard",
      stats: toOptions(SAVE_STATS.map((s) => ({ value: s, label: L(`SARGAS_TRAPZORS.Config.SaveStat.${s}`) })), v.payload.roll.save.statistic),
      hazard: this.#hazardContext(v),
      dcSources: toOptions(DC_SOURCES.map((s) => ({ value: s, label: L(`SARGAS_TRAPZORS.Config.DCSource.${s}`) })), v.detection.dcSource),
      ranks: toOptions(RANKS.map((r) => ({ value: r, label: L(`SARGAS_TRAPZORS.Config.Rank.${RANK_KEYS[r]}`) })), v.detection.minRank),
      effectLink: linkView(links.effect),
      detectionLink: linkView(links.detection),
      effectStrip: this.#strip("effect", links.effect, getEffectRegion(b)),
      detectionStrip: this.#strip("detection", links.detection, b.scene?.regions?.get(b.system.detection.regionId)),
      rearmUnits: toOptions(Object.keys(REARM_UNITS).map((u) => ({ value: u, label: L(`SARGAS_TRAPZORS.Config.RearmUnit.${u}`) })), v.rearm.unit),
      rearmIn: this.#rearmIn(b),
      animation: await this.#animationContext(v),
      anchorHint: L(`SARGAS_TRAPZORS.Config.Anchor.hint.${v.effect.anchor}`),
      kindHint: L(`SARGAS_TRAPZORS.Config.Kind.hint.${v.payload.kind}`),
      lastFired: b.system.lastFired ? relativeTime(b.system.lastFired.at) : L("SARGAS_TRAPZORS.Config.Never"),
      hasEffectArea: links.effect === "ok",
      hasDetectionArea: links.detection === "ok",
      detectionSupported: !!caps.detection,
      dispositions,
      actorTypes,
      soundPath: v.payload.soundPath ?? ""
    });
  }

  /** Animation select (None, preset groups, Custom), custom-file fields and JB2A availability. */
  async #animationContext(v) {
    const anim = v.effect.animation ?? {};
    const hasJb2a = jb2aRoot() !== null;
    // null = stored value; "" = the user picked None; "custom" = the user picked Custom file.
    const selected = anim.preset === "custom" ? "custom" : anim.preset ? anim.preset : (anim.preset === null && anim.file ? "custom" : "");
    const groups = [];
    if (hasJb2a) {
      const ok = new Map(await Promise.all(ANIMATION_PRESETS.map(async (pr) => [pr.id, await presetAvailable(pr)])));
      for (const g of ANIMATION_GROUPS) {
        groups.push({
          label: L(`SARGAS_TRAPZORS.Animation.Group.${g}`),
          options: presetsByGroup(g).map((pr) => {
            const missing = !ok.get(pr.id);
            return {
              value: pr.id,
              label: missing ? `${L(pr.labelKey)} ${L("SARGAS_TRAPZORS.Animation.NotInstalled")}` : L(pr.labelKey),
              selected: pr.id === selected,
              disabled: missing && pr.id !== selected // a disabled option is not submitted: keep the stored one enabled
            };
          })
        });
      }
    }
    return {
      options: [{ value: "", label: L("SARGAS_TRAPZORS.Animation.None"), selected: selected === "" }],
      groups,
      isCustom: selected === "custom",
      file: anim.file ?? "",
      modes: toOptions(ANIMATION_MODES.map((m) => ({ value: m, label: L(`SARGAS_TRAPZORS.Animation.Mode.${m}`) })), anim.mode ?? "area"),
      hasJb2a
    };
  }

  /** "re-arms in ..." for a spent trap with a timer; null otherwise. */
  #rearmIn(b) {
    const s = b.system;
    if (s.status !== "spent") return null;
    const left = rearmRemaining({ rearmSeconds: s.rearmSeconds, firedWorldTime: s.lastFired?.worldTime ?? null, now: game.time.worldTime });
    return left === null ? null : L("SARGAS_TRAPZORS.Manager.RearmsIn", { time: formatDuration(left) });
  }

  /** Status strip for a linked area. @param {"effect"|"detection"} role */
  #strip(role, status, region) {
    const link = linkView(status);
    const key = link.broken ? "missing" : status;
    return {
      ...link,
      icon: link.broken ? "fa-triangle-exclamation" : link.ok ? "fa-link" : "fa-link-slash",
      title: L(`SARGAS_TRAPZORS.Config.Strip.${role}.${key}`),
      sub: link.broken ? L("SARGAS_TRAPZORS.Config.Strip.BrokenSub")
        : link.ok ? L("SARGAS_TRAPZORS.Config.Strip.OkSub", { name: region?.name ?? "" })
          : L(`SARGAS_TRAPZORS.Config.Strip.${role}.noneSub`),
      placeLabel: L(link.ok ? "SARGAS_TRAPZORS.Config.Replace" : "SARGAS_TRAPZORS.Config.Place")
    };
  }

  /** Hazard actor and item selections, plus a broken-link note. */
  #hazardContext(v) {
    const actorUuid = v.payload.hazard.actorUuid || "";
    const itemId = v.payload.hazard.itemId || "";
    const actors = game.actors.filter((a) => a.type === "hazard").sort((a, b) => a.name.localeCompare(b.name));
    const list = actors.map((a) => ({ value: a.uuid, label: a.name }));
    const actor = actorUuid ? fromUuidSync(actorUuid) : null;
    const actorOk = !!actor && actor.documentName === "Actor";
    if (actorUuid && !list.some((o) => o.value === actorUuid)) {
      list.push({ value: actorUuid, label: actorOk ? actor.name : actorUuid });
    }
    const mk = (type) => actorOk
      ? actor.items.filter((i) => i.type === type).map((i) => ({ value: i.id, label: i.name }))
      : [];
    const actionItems = mk("action");
    const strikeItems = mk("melee");
    const itemOk = !itemId || [...actionItems, ...strikeItems].some((i) => i.value === itemId);
    const isStrike = strikeItems.some((i) => i.value === itemId);
    const strikeTargets = v.payload.hazard.strikeTargets || "affected";
    let note = null;
    if (actorUuid && !actorOk) note = L("SARGAS_TRAPZORS.Config.HazardBrokenActor");
    else if (itemId && !itemOk) note = L("SARGAS_TRAPZORS.Config.HazardBrokenItem");
    let summary = null;
    const adapter = getAdapter();
    if (actorOk && adapter.capabilities.hazard) {
      const info = adapter.describeHazard(actor);
      if (info) {
        const rank = info.minRank > 0
          ? L(`SARGAS_TRAPZORS.Config.Rank.${RANK_KEYS[info.minRank]}`)
          : L("SARGAS_TRAPZORS.Hazard.NoMinRank");
        summary = L("SARGAS_TRAPZORS.Hazard.Summary", {
          kind: L(`SARGAS_TRAPZORS.Browser.Kind.${info.kind}`),
          level: info.level,
          dc: info.stealthDC ?? "?",
          rank
        });
      }
    }
    return {
      actors: toOptions(list, actorUuid),
      itemGroups: [
        { label: L("SARGAS_TRAPZORS.Config.HazardGroupActions"), items: toOptions(actionItems, itemId) },
        { label: L("SARGAS_TRAPZORS.Config.HazardGroupStrikes"), items: toOptions(strikeItems, itemId) }
      ].filter((g) => g.items.length),
      isStrike,
      strikeTargets: toOptions(
        ["affected", "triggering"].map((m) => ({ value: m, label: L(`SARGAS_TRAPZORS.Config.StrikeTarget.${m}`) })),
        strikeTargets
      ),
      summary,
      hasActor: actorOk,
      broken: !!note,
      note
    };
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext?.(partId, context, options) ?? context;
    const tab = context.tabs?.[partId];
    if (tab) context.tab = tab;
    return context;
  }

  /* ------------------------------------------------------------ */
  /*  Lifecycle                                                    */
  /* ------------------------------------------------------------ */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // Structural changes re-render so dependent controls update; unsaved values survive via the draft.
    this.element.addEventListener("input", () => { this.#dirty = true; });
    this.element.addEventListener("change", (event) => {
      this.#dirty = true;
      const name = event.target?.name;
      if (["payload.kind", "payload.hazard.actorUuid", "payload.hazard.itemId", "effect.anchor", "effect.animation.preset"].includes(name)) this.render();
    });
    const rerender = debounce(() => { if (this.rendered) this.render(); }, 100);
    const sceneId = this.document.parent?.parent?.id;
    const onRegion = (region) => { if (region.parent?.id === sceneId) rerender(); };
    for (const hook of ["createRegion", "updateRegion", "deleteRegion"]) {
      this.#hookIds.push([hook, Hooks.on(hook, onRegion)]);
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
  }

  /* ------------------------------------------------------------ */
  /*  Actions                                                      */
  /* ------------------------------------------------------------ */

  static async #onPlaceEffect() {
    if (!(await this.#save())) return;
    const b = this.document;
    if (getLinkStatus(b).effect === "ok" && !(await confirmReplace("SARGAS_TRAPZORS.Links.Role.effect"))) return;
    try {
      await createEffectArea(b, { kind: b.system.effect.shape, anchor: b.system.effect.anchor });
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    }
    await this.render();
  }

  static async #onPreview() {
    try { await previewEffect(this.document); } catch (err) { ui.notifications.error(err.message, { console: false }); }
  }

  /** GM-local preview of the current (possibly unsaved) animation choice on the effect area. */
  static async #onPreviewAnimation() {
    const el = this.element;
    const sel = el.querySelector('[name="effect.animation.preset"]')?.value ?? "";
    const file = el.querySelector('[name="effect.animation.file"]')?.value.trim() ?? "";
    const mode = el.querySelector('[name="effect.animation.mode"]')?.value ?? "area";
    let animation = null;
    if (sel === "custom" && file) animation = { preset: null, file, mode };
    else if (sel && sel !== "custom") animation = { preset: sel, file: null, mode };
    if (!animation) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.Animation.PreviewNone"));
      return;
    }
    const shapes = resolveEffectShapes(this.document, firstControlledToken()?.document);
    if (!shapes) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.Animation.PreviewNoArea"));
      return;
    }
    const played = await playAnimation(this.document, shapes, { test: true, animation });
    if (!played) ui.notifications.warn(L("SARGAS_TRAPZORS.Animation.PreviewFailed"));
  }

  static #onBrowseAnimation() {
    const input = this.element.querySelector('[name="effect.animation.file"]');
    new foundry.applications.apps.FilePicker.implementation({
      type: "imagevideo",
      current: input?.value ?? "",
      callback: (path) => {
        if (!input) return;
        input.value = path;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }).render({ force: true });
  }

  static async #onRepair() {
    try { await repairLinks(this.document); } catch (err) { ui.notifications.error(err.message, { console: false }); }
    await this.render();
  }

  static async #onReset() {
    await getTriggerService()?.reset(this.document);
  }

  static async #onCreateDetection() {
    // Read the radius before saving: the save re-renders and resets this unsaved input.
    const radius = Number(this.element.querySelector('[name="detectionRadius"]')?.value);
    if (!(await this.#save())) return;
    const b = this.document;
    if (getLinkStatus(b).detection === "ok" && !(await confirmReplace("SARGAS_TRAPZORS.Links.Role.detection"))) return;
    const radiusFt = Number.isFinite(radius) && radius > 0 ? radius : 10;
    try {
      await createDetectionArea(b, { radiusFt });
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    }
    await this.render();
  }

  /** Overwrite detection and lifecycle settings from the hazard picked in the Payload tab. */
  static async #onConfigureFromHazard() {
    const actorUuid = this.element.querySelector('[name="payload.hazard.actorUuid"]')?.value;
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    if (!actor) {
      ui.notifications.warn(L("SARGAS_TRAPZORS.Hazard.PickFirst"));
      return;
    }
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SARGAS_TRAPZORS.Hazard.ConfigureTitle") },
      content: `<p>${foundry.utils.escapeHTML(L("SARGAS_TRAPZORS.Hazard.ConfigureBody", { name: actor.name }))}</p>`,
      rejectClose: false,
      modal: true
    });
    if (!ok) return;
    try {
      await configureTrapFromHazard(this.document, actor);
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
      return;
    }
    this.#draft = null;
    this.#dirty = false;
    await this.render();
  }

  static async #onTestFire() {
    const b = this.document;
    const service = getTriggerService();
    if (!service) return;
    if (b.system.status === "pending") await service.runAction(b.uuid, "test");
    else await service.manualFire(b, { test: true, token: firstControlledToken()?.document ?? null });
  }

  static async #onReveal() {
    try { await reveal(this.document); } catch (err) { ui.notifications.error(err.message, { console: false }); }
  }

  static #onBrowseSound() {
    const input = this.element.querySelector('[name="payload.soundPath"]');
    new foundry.applications.apps.FilePicker.implementation({
      type: "audio",
      current: input?.value ?? "",
      callback: (path) => {
        if (!input) return;
        input.value = path;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }).render({ force: true });
  }
}
