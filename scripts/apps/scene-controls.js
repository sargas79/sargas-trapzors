// Foundry-dependent. Never import from tests.
// Region-layer tools: Create Trap (convert/arm) and Trap Manager.
import { MODULE_ID, TRAP_TYPE } from "../core/constants.js";
import { L } from "./ui-helpers.js";
import { TrapManager } from "./trap-manager.js";

const isTrapRegion = (region) => region.behaviors.some((b) => b.type === TRAP_TYPE);
const VIS = () => CONST.REGION_VISIBILITY ?? { GAMEMASTER: 1 };
const OWN = () => CONST.DOCUMENT_OWNERSHIP_LEVELS ?? { NONE: 0 };

let armed = false;
let hookId = null;

/** Open the Trap Manager. */
export function openTrapManager() {
  return TrapManager.open();
}

/**
 * Turn a region into a trap: GM-only visibility, no player ownership, a trap behavior, then open its sheet.
 * @param {RegionDocument} region
 * @returns {Promise<RegionBehavior|null>}
 */
export async function createTrapFromRegion(region) {
  if (!game.user.isGM) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Config.GMOnly"));
    return null;
  }
  if (isTrapRegion(region)) {
    ui.notifications.warn(L("SARGAS_TRAPZORS.Create.AlreadyTrap"));
    return region.behaviors.find((b) => b.type === TRAP_TYPE);
  }
  const update = { visibility: VIS().GAMEMASTER, ownership: { default: OWN().NONE } };
  if (!region.name) update.name = L("SARGAS_TRAPZORS.Behavior.trap.label");
  await region.update(update);
  const [behavior] = await region.createEmbeddedDocuments("RegionBehavior", [{
    type: TRAP_TYPE, name: L("SARGAS_TRAPZORS.Behavior.trap.label")
  }]);
  behavior?.sheet?.render(true);
  return behavior ?? null;
}

function refreshControls() {
  ui.controls?.render?.();
}

function disarm(notify = false) {
  if (hookId !== null) Hooks.off("createRegion", hookId);
  hookId = null;
  armed = false;
  refreshControls();
  if (notify) ui.notifications.info(L("SARGAS_TRAPZORS.Create.Cancelled"));
}

function arm() {
  armed = true;
  hookId = Hooks.on("createRegion", (region, options, userId) => {
    if (userId !== game.user.id) return;
    if (options?.sargasTrapzors?.cascade) return;
    const role = region.getFlag(MODULE_ID, "role");
    if (role) return; // our own effect/detection/reveal regions
    disarm();
    createTrapFromRegion(region).catch((err) => {
      console.error(err);
      ui.notifications.error(err.message, { console: false });
    });
  });
  ui.notifications.info(L("SARGAS_TRAPZORS.Create.Armed"));
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
