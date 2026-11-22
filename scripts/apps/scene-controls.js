// Foundry-dependent. Never import from tests.
// Region-layer tools: Create Trap (convert/arm) and Trap Manager.
import { MODULE_ID, TRAP_TYPE } from "../core/constants.js";
import { L } from "./ui-helpers.js";
import { TrapManager } from "./trap-manager.js";
import { configureTrapFromHazard, importHazard } from "../foundry/hazard-traps.js";

const isTrapRegion = (region) => region.behaviors.some((b) => b.type === TRAP_TYPE);
const VIS = () => CONST.REGION_VISIBILITY ?? { GAMEMASTER: 1 };
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS ?? { NONE: 0 };

let armed = false;
let hookId = null;
/** Hazard actor the next drawn region is configured from (null for a plain Create Trap). */
let pendingHazard = null;

/** Open the Trap Manager. */
export function openTrapManager() {
  return TrapManager.open();
}

/**
 * Turn a region into a trap: GM-only visibility, no player ownership, a trap behavior, then open its sheet.
 * With a hazard actor the region is named after it and the trap is configured from it first.
 * @param {RegionDocument} region
 * @param {{hazard?:Actor|null}} [opts]
 * @returns {Promise<RegionBehavior|null>}
 */
export async function createTrapFromRegion(region, { hazard = null } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Config.GMOnly"));
    return null;
  }
  if (isTrapRegion(region)) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Create.AlreadyTrap"));
    return region.behaviors.find((b) => b.type === TRAP_TYPE);
  }
  const update = { visibility: VIS().GAMEMASTER, ownership: { default: OWN().NONE } };
  if (hazard) update.name = hazard.name;
  else if (!region.name) update.name = L("SARGAS_TRAPZORS.Behavior.trap.label");
  await region.update(update);
  const [behavior] = await region.createEmbeddedDocuments("RegionBehavior", [{
    type: TRAP_TYPE, name: L("SARGAS_TRAPZORS.Behavior.trap.label")
  }]);
  if (behavior && hazard) {
    try {
      await configureTrapFromHazard(behavior, hazard);
    } catch (err) {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    }
  }
  behavior?.sheet?.render(true);
  return behavior ?? null;
}

/**
 * Create a trap from a compendium hazard: import it, then convert the single controlled region,
 * or arm Create Trap so the next drawn region becomes the trap.
 * @param {string} uuid  compendium hazard uuid
 */
export async function createTrapFromHazard(uuid) {
  if (!game.user.isGM) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Config.GMOnly"));
    return;
  }
  const actor = await importHazard(uuid);
  const controlled = canvas.regions?.controlled ?? [];
  if (controlled.length === 1 && !isTrapRegion(controlled[0].document)) {
    if (armed) disarm();
    await createTrapFromRegion(controlled[0].document, { hazard: actor });
    return;
  }
  if (armed) disarm();
  arm(actor);
}

function refreshControls() {
  ui.controls?.render?.();
}

function disarm(notify = false) {
  if (hookId !== null) Hooks.off("createRegion", hookId);
  hookId = null;
  armed = false;
  pendingHazard = null;
  refreshControls();
  if (notify) ui.notifications.info(L("SARGAS_TRAPZORS.Create.Cancelled"));
}

function arm(hazard = null) {
  armed = true;
  pendingHazard = hazard;
  hookId = Hooks.on("createRegion", (region, options, userId) => {
    if (userId !== game.user.id) return;
    if (options?.sargasTrapzors?.cascade) return;
    const role = region.getFlag(MODULE_ID, "role");
    if (role) return; // our own effect/detection/reveal regions
    const hazardActor = pendingHazard;
    disarm();
    createTrapFromRegion(region, { hazard: hazardActor }).catch((err) => {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    });
  });
  ui.notifications.info(hazard
    ? L("SARGAS_TRAPZORS.Create.ArmedHazard", { name: hazard.name })
    : L("SARGAS_TRAPZORS.Create.Armed"));
  refreshControls();
}

async function onCreateTrap() {
  if (armed) return disarm(true);
  const controlled = canvas.regions?.controlled ?? [];
  if (controlled.length === 1 && !isTrapRegion(controlled[0].document)) {
    await createTrapFromRegion(controlled[0].document);
    return;
  }
  arm();
}

/** Button tools are never "active" in core, so mark the armed state on the DOM after each render. */
function markArmed() {
  const btn = document.querySelector('#scene-controls-tools [data-tool="sargasTrapzorsCreate"]');
  if (!btn) return;
  btn.classList.toggle("st-armed", armed);
  btn.setAttribute("aria-pressed", String(armed));
}

/** Register the getSceneControlButtons hook. Call from init. */
export function registerSceneControls() {
  Hooks.on("renderSceneControls", markArmed);
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;
    const regions = controls.regions;
    if (!regions) return;
    regions.tools ??= {};
    regions.tools.sargasTrapzorsCreate = {
      name: "sargasTrapzorsCreate",
      title: "SARGAS_TRAPZORS.Create.Tool",
      icon: "fa-solid fa-triangle-exclamation",
      order: 90,
      button: true,
      visible: game.user.isGM,
      onChange: () => { onCreateTrap().catch((err) => ui.notifications.error(err.message, { console: false })); }
    };
    regions.tools.sargasTrapzorsManager = {
      name: "sargasTrapzorsManager",
      title: "SARGAS_TRAPZORS.Manager.Tool",
      icon: "fa-solid fa-list",
      order: 91,
      button: true,
      visible: game.user.isGM,
      onChange: () => { openTrapManager(); }
    };
  });
}
