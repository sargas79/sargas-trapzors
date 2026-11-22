// Foundry entry point. Uses Foundry globals; never import this from tests.
import { MODULE_ID, TRAP_TYPE } from "./core/constants.js";
import { createLogger } from "./foundry/logger.js";
import TrapBehaviorType from "./foundry/trap-behavior.js";
import * as effectArea from "./foundry/effect-area.js";
import DetectionBehaviorType from "./foundry/detection-behavior.js";
import { createDetectionService, createDetectionArea, reveal } from "./foundry/detection-service.js";
import { registerChatHooks } from "./foundry/chat.js";
import { getLinkStatus, repairLinks, deleteTrap, duplicateTrap, registerLinkedRegionHooks, cleanupOrphans } from "./foundry/linked-regions.js";
import { TrapConfig } from "./apps/trap-config.js";
import { registerSceneControls, createTrapFromRegion, openTrapManager } from "./apps/scene-controls.js";
import { createTriggerService } from "./foundry/trigger-service.js";
import { configureTrapFromHazard, importHazard } from "./foundry/hazard-traps.js";
import { debounce } from "./apps/ui-helpers.js";

const log = createLogger({
  prefix: MODULE_ID,
  isGM: () => game.user?.isGM ?? false,
  isDebugEnabled: () => {
    try { return game.settings.get(MODULE_ID, "debug"); } catch { return false; }
  }
});

Hooks.once("init", () => {
  CONFIG.RegionBehavior.dataModels[TRAP_TYPE] = TrapBehaviorType;
  CONFIG.RegionBehavior.typeLabels[TRAP_TYPE] = "SARGAS_TRAPZORS.Behavior.trap.label";
  CONFIG.RegionBehavior.typeIcons[TRAP_TYPE] = "fa-solid fa-triangle-exclamation";

  CONFIG.RegionBehavior.dataModels[`${MODULE_ID}.trapDetection`] = DetectionBehaviorType;
  CONFIG.RegionBehavior.typeLabels[`${MODULE_ID}.trapDetection`] = "SARGAS_TRAPZORS.Behavior.trapDetection.label";
  CONFIG.RegionBehavior.typeIcons[`${MODULE_ID}.trapDetection`] = "fa-solid fa-eye";

  foundry.applications.apps.DocumentSheetConfig.registerSheet(CONFIG.RegionBehavior.documentClass, MODULE_ID, TrapConfig, {
    types: [TRAP_TYPE],
    makeDefault: true,
    label: "SARGAS_TRAPZORS.Config.SheetLabel"
  });
  registerSceneControls();

  game.modules.get(MODULE_ID).api = {
    createDetectionArea,
    reveal,
    createEffectArea: effectArea.createEffectArea,
    setBlockedByWalls: effectArea.setBlockedByWalls,
    previewEffect: effectArea.previewEffect,
    resolveAffectedTokens: effectArea.resolveAffectedTokens,
    getLinkStatus,
    repairLinks,
    deleteTrap,
    duplicateTrap,
    createTrapFromRegion,
    openTrapManager,
    configureTrapFromHazard,
    importHazard
  };

  game.settings.register(MODULE_ID, "debug", {
    name: "SARGAS_TRAPZORS.Settings.Debug.Name",
    hint: "SARGAS_TRAPZORS.Settings.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", () => {
  // game.user is unavailable during init, so GM-gated logging must happen here.
  log.info("ready", { version: game.modules.get(MODULE_ID)?.version });
  effectArea.cleanupReveals().catch((err) => log.error("reveal cleanup failed", err));
  registerLinkedRegionHooks({ log });
  cleanupOrphans({ log }).catch((err) => log.error("orphan cleanup failed", err));
  createDetectionService({ log });
  registerChatHooks({ onReveal: (uuid) => reveal(uuid) });
  const service = createTriggerService({ log });
  service.recover().catch((err) => log.error("recovery failed", err));
  // Re-arm timers run on game time: check now, and whenever the world clock moves (debounced).
  service.checkRearms();
  Hooks.on("updateWorldTime", debounce(() => service.checkRearms(), 500));
  // Fires on connect and disconnect: authority may have moved to (or away from) this client.
  Hooks.on("userConnected", () => {
    service.recover().catch((err) => log.error("recovery failed", err));
    service.checkRearms();
  });
});
