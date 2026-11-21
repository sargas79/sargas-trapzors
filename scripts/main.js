// Foundry entry point. Uses Foundry globals; never import this from tests.
import { MODULE_ID, TRAP_TYPE } from "./core/constants.js";
import { createLogger } from "./foundry/logger.js";
import TrapBehaviorType from "./foundry/trap-behavior.js";
import * as effectArea from "./foundry/effect-area.js";
import { createTriggerService } from "./foundry/trigger-service.js";

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

  game.modules.get(MODULE_ID).api = {
    createEffectArea: effectArea.createEffectArea,
    setBlockedByWalls: effectArea.setBlockedByWalls,
    previewEffect: effectArea.previewEffect,
    resolveAffectedTokens: effectArea.resolveAffectedTokens
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
  const service = createTriggerService({ log });
  service.recover().catch((err) => log.error("recovery failed", err));
  // Fires on connect and disconnect: authority may have moved to (or away from) this client.
  Hooks.on("userConnected", () => {
    service.recover().catch((err) => log.error("recovery failed", err));
  });
});
