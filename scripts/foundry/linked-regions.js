// Foundry-dependent. Never import from tests.
// Lifecycle sync for the effect/detection regions linked to a trap (plan sections 8, 9, 15).
import { MODULE_ID, TRAP_TYPE } from "../core/constants.js";
import { translateShape } from "../core/geometry.js";
import { linkStatus, planRepair, findOrphans } from "../core/links.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const ROLES = ["effect", "detection"];
/** Passed as a document operation option so our own deletions don't re-trigger the hooks. */
const CASCADE = { sargasTrapzors: { cascade: true } };
const isCascade = (options) => !!options?.sargasTrapzors?.cascade;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

function requireGM() {
  if (!game.user.isGM) throw new Error("Only a GM can do this.");
}

function asBehavior(b) {
  return typeof b === "string" ? fromUuidSync(b) : b;
}

const linkedId = (trap, role) => trap.system[role]?.regionId ?? null;
const flagsOf = (region) => region?.flags?.[MODULE_ID] ?? {};
const sceneOf = (trap) => trap.scene ?? trap.region?.parent ?? null;
const isTrap = (b) => b?.type === TRAP_TYPE;

function flagsMatch(region, trap, role) {
  const f = flagsOf(region);
  return f.role === role && f.trapBehaviorId === trap.id;
}

/** The role if `region` is an effect/detection region (by flags), else null. */
function linkedRole(region) {
  const role = flagsOf(region).role;
  return ROLES.includes(role) ? role : null;
}

function statusFor(trap, role) {
  const id = linkedId(trap, role);
  const region = id ? sceneOf(trap)?.regions?.get(id) : null;
  return linkStatus({ linkedId: id, regionExists: !!region, flagsMatch: region ? flagsMatch(region, trap, role) : false });
}

/** @returns {{effect:"none"|"ok"|"missing"|"foreign", detection:"none"|"ok"|"missing"|"foreign"}} */
export function getLinkStatus(trap) {
  trap = asBehavior(trap);
  return { effect: statusFor(trap, "effect"), detection: statusFor(trap, "detection") };
}

function candidateFor(trap, role) {
  const current = linkedId(trap, role);
  return sceneOf(trap)?.regions?.find((r) => r.id !== current && flagsMatch(r, trap, role))?.id ?? null;
}

/**
 * Fix missing/foreign links: relink to a region flagged for this trap, else clear the id.
 * Clearing the detection link also disables detection.
 * @returns {Promise<{effect:object|null, detection:object|null}>} per role {status, action, regionId}, or null if untouched
 */
export async function repairLinks(trap) {
  requireGM();
  trap = asBehavior(trap);
  const status = getLinkStatus(trap);
  const update = {};
  const changes = { effect: null, detection: null };
  for (const role of ROLES) {
    const plan = planRepair(status[role], candidateFor(trap, role));
    if (plan.action === "keep") continue;
    update[`system.${role}.regionId`] = plan.regionId;
    if (role === "detection" && plan.action === "clear") update["system.detection.enabled"] = false;
    changes[role] = { status: status[role], action: plan.action, regionId: plan.regionId };
  }
  if (Object.keys(update).length) await trap.update(update);
  return changes;
}

/** Linked regions (existing and flagged for this trap) as [role, region] pairs. */
function ownedLinks(trap) {
  const scene = sceneOf(trap);
  const out = [];
  for (const role of ROLES) {
    const id = linkedId(trap, role);
    const region = id ? scene?.regions?.get(id) : null;
    if (region && flagsMatch(region, trap, role)) out.push([role, region]);
  }
  return out;
}

/** Delete regions in one scene (cascade-flagged), skipping ids that are already gone. */
async function deleteRegions(scene, ids) {
  ids = [...new Set(ids)].filter((id) => scene?.regions?.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids, { ...CASCADE });
  return ids;
}

/**
 * Delete the trap's currently linked region for one role (if it still exists and is flagged for this trap).
 * Used before creating a replacement so no orphan remains.
 */
export async function removeLinkedRegion(trap, role) {
  trap = asBehavior(trap);
  const scene = sceneOf(trap);
  const id = linkedId(trap, role);
  const region = id ? scene?.regions?.get(id) : null;
  if (region && flagsMatch(region, trap, role)) await deleteRegions(scene, [region.id]);
}

/**
 * Delete a trap with its linked regions. The trigger region goes too when the trap is its only behavior.
 * @returns {Promise<boolean>} false when the GM cancelled
 */
export async function deleteTrap(trap, { confirm = true } = {}) {
  requireGM();
  trap = asBehavior(trap);
  const scene = sceneOf(trap);
  const trigger = trap.region;
  const links = ownedLinks(trap);
  const deleteTrigger = !!trigger && trigger.behaviors.size <= 1;

  if (confirm) {
    const names = links.map(([role, r]) => `${L(`SARGAS_TRAPZORS.Links.Role.${role}`)}: ${esc(r.name)}`);
    if (deleteTrigger) names.unshift(`${L("SARGAS_TRAPZORS.Links.Role.trigger")}: ${esc(trigger.name)}`);
    const list = names.length ? `<ul>${names.map((n) => `<li>${n}</li>`).join("")}</ul>` : "";
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("SARGAS_TRAPZORS.Links.DeleteTitle") },
      content: `<p>${L("SARGAS_TRAPZORS.Links.DeleteBody", { trap: esc(trigger?.name ?? trap.name) })}</p>${list}`,
      rejectClose: false,
      modal: true
    });
    if (!ok) return false;
  }

  const ids = links.map(([, r]) => r.id);
  if (deleteTrigger) ids.push(trigger.id);
  await deleteRegions(scene, ids);
  if (!deleteTrigger && trigger?.behaviors.has(trap.id)) await trap.delete({ ...CASCADE });
  return true;
}

const stripIds = (data) => {
  delete data._id;
  delete data._stats;
  return data;
};

/**
 * Duplicate a trap with fresh state and fresh, correctly flagged linked regions.
 * @param {RegionBehavior|string} trap
 * @param {{dx?:number, dy?:number}} [opts]  pixel offset; default one grid square right and down
 * @returns {Promise<RegionBehavior>} the new trap behavior
 */
export async function duplicateTrap(trap, { dx, dy } = {}) {
  requireGM();
  trap = asBehavior(trap);
  const scene = sceneOf(trap);
  const size = scene.grid.size;
  dx ??= size;
  dy ??= size;
  const tr = (shapes) => shapes.map((s) => translateShape(s, dx, dy, size));
  const created = [];

  try {
    // Trigger region
    const source = trap.region;
    const data = stripIds(source.toObject());
    const trapIndex = data.behaviors.findIndex((b) => b._id === trap.id);
    data.name = `${source.name} (copy)`;
    data.shapes = tr(data.shapes);
    // A revealed trigger is visible to players; the copy starts hidden again.
    if (trap.system.revealed) data.visibility = CONST.REGION_VISIBILITY?.GAMEMASTER ?? 1;
    data.behaviors = data.behaviors.map((b) => {
      const isSource = b._id === trap.id;
      stripIds(b);
      if (isSource) {
        b.system.status = "armed";
        b.system.pending = [];
        b.system.lastFired = null;
        b.system.revealed = false;
        b.system.detection.checked = [];
        b.system.effect.regionId = null;
        b.system.detection.regionId = null;
      }
      return b;
    });
    const [newRegion] = await scene.createEmbeddedDocuments("Region", [data], { ...CASCADE });
    created.push(newRegion.id);
    const behaviors = [...newRegion.behaviors];
    const newTrap = behaviors[trapIndex]?.type === TRAP_TYPE ? behaviors[trapIndex] : behaviors.find(isTrap);
    const link = (role) => ({ [MODULE_ID]: { role, trapRegionId: newRegion.id, trapBehaviorId: newTrap.id } });

    // Linked regions
    const update = {};
    for (const [role, src] of ownedLinks(trap)) {
      const d = stripIds(src.toObject());
      d.name = `${src.name} (copy)`;
      d.shapes = tr(d.shapes);
      d.flags = { ...d.flags, ...link(role) };
      for (const b of d.behaviors) {
        stripIds(b);
        if (b.type === `${MODULE_ID}.trapDetection`) b.system.trapBehaviorUuid = newTrap.uuid;
      }
      const [region] = await scene.createEmbeddedDocuments("Region", [d], { ...CASCADE });
      created.push(region.id);
      update[`system.${role}.regionId`] = region.id;
    }
    if (Object.keys(update).length) await newTrap.update(update);
    return newTrap;
  } catch (err) {
    await deleteRegions(scene, created).catch(() => {});
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

const gmIds = () => ChatMessage.getWhisperRecipients("GM").map((u) => u.id);

/** Delete the effect/detection regions that a removed trap behavior still names. */
async function cascadeDelete(behavior, scene, log) {
  if (!scene) return;
  const ids = [];
  for (const role of ROLES) {
    const id = linkedId(behavior, role);
    const region = id ? scene.regions.get(id) : null;
    if (region && flagsMatch(region, behavior, role)) ids.push(id);
  }
  if (!ids.length) return;
  await deleteRegions(scene, ids);
  log?.debug("deleted linked regions of removed trap", { trap: behavior.id, ids });
}

/** Clear ids on a freshly created trap whose links point at another trap's regions. */
async function sanitizeCopy(region, log) {
  for (const behavior of region.behaviors) {
    if (!isTrap(behavior)) continue;
    const update = {};
    for (const role of ROLES) {
      if (statusFor(behavior, role) !== "foreign") continue;
      update[`system.${role}.regionId`] = null;
      if (role === "detection") update["system.detection.enabled"] = false;
    }
    if (Object.keys(update).length) {
      await behavior.update(update);
      log?.debug("cleared foreign links on copied trap", { trap: behavior.id, update });
    }
  }
}

async function warnBroken(region, log) {
  const f = flagsOf(region);
  const role = linkedRole(region);
  const trapRegion = region.parent?.regions?.get(f.trapRegionId);
  const trap = trapRegion?.behaviors?.get(f.trapBehaviorId);
  if (!role || !isTrap(trap) || linkedId(trap, role) !== region.id) return;
  const text = L("SARGAS_TRAPZORS.Links.AreaDeleted", {
    area: L(`SARGAS_TRAPZORS.Links.Role.${role}`).toLowerCase(),
    trap: esc(trapRegion.name)
  });
  await ChatMessage.create({ content: `<p><em>${text}</em></p>`, whisper: gmIds() });
  log?.debug("linked region deleted by hand", { trap: trap.id, role });
}

/** Register the lifecycle hooks. Call once from ready. */
export function registerLinkedRegionHooks({ log } = {}) {
  const guard = (fn) => (...args) => {
    if (!game.user.isActiveGM) return;
    Promise.resolve(fn(...args)).catch((err) => log?.error("linked-region sync failed", err));
  };

  Hooks.on("deleteRegionBehavior", guard((behavior, options) => {
    if (isCascade(options) || !isTrap(behavior)) return;
    return cascadeDelete(behavior, behavior.region?.parent ?? behavior.parent?.parent, log);
  }));

  Hooks.on("deleteRegion", guard(async (region, options) => {
    if (isCascade(options)) return;
    // A trigger region carrying trap behaviors: remove their linked regions.
    for (const behavior of region.behaviors ?? []) {
      if (isTrap(behavior)) await cascadeDelete(behavior, region.parent, log);
    }
    // A linked region deleted by hand: report, leave the trap alone.
    if (linkedRole(region)) await warnBroken(region, log);
  }));

  Hooks.on("createRegion", guard((region, options) => {
    if (isCascade(options)) return;
    return sanitizeCopy(region, log);
  }));
}

/** Delete linked regions whose trap behavior no longer exists; report broken trap links. */
export async function cleanupOrphans({ log } = {}) {
  if (!game.user.isActiveGM) return;
  let removed = 0;
  let broken = 0;
  for (const scene of game.scenes) {
    const traps = [];
    const linked = [];
    for (const region of scene.regions) {
      for (const b of region.behaviors) if (isTrap(b)) traps.push(b);
      if (linkedRole(region)) linked.push({ id: region.id, trapBehaviorId: flagsOf(region).trapBehaviorId });
    }
    const orphans = findOrphans(linked, traps.map((t) => t.id));
    if (orphans.length) {
      await scene.deleteEmbeddedDocuments("Region", orphans, { ...CASCADE });
      removed += orphans.length;
    }
    for (const t of traps) {
      const s = getLinkStatus(t);
      for (const role of ROLES) {
        if (s[role] === "missing" || s[role] === "foreign") {
          broken++;
          log?.debug("broken link", { scene: scene.id, trap: t.id, role, status: s[role] });
        }
      }
    }
  }
  log?.debug("linked-region cleanup", { orphansRemoved: removed, brokenLinks: broken });
}
