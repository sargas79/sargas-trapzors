/** Pure detection decisions (plan A11, section 10). No Foundry globals. */

/**
 * Should a token entering the detection region trigger a Perception check?
 * @returns {{action:"check"|"ignore", reason:string}}
 */
export function decideDetection({
  isActiveGM, trapExists, trapDisabled, detectionEnabled, status, revealed, eligible, alreadyChecked, isDuplicate
}) {
  const ignore = (reason) => ({ action: "ignore", reason });
  if (!isActiveGM) return ignore("not-authority");
  if (!trapExists) return ignore("trap-missing");
  if (trapDisabled) return ignore("trap-disabled");
  if (!detectionEnabled) return ignore("detection-disabled");
  if (status !== "armed" && status !== "pending") return ignore("not-armed");
  if (revealed) return ignore("revealed");
  if (!eligible) return ignore("ineligible");
  if (alreadyChecked) return ignore("already-checked");
  if (isDuplicate) return ignore("duplicate");
  return { action: "check", reason: "ok" };
}

/** @returns {{ok:boolean, reason:string|null}} */
export function checkRequirements({ requireSearch, isSearching, minRank = 0, rank = 0 }) {
  if (requireSearch && !isSearching) return { ok: false, reason: "not-searching" };
  if (rank < minRank) return { ok: false, reason: "rank-too-low" };
  return { ok: true, reason: null };
}

/** DC from the configured source; null when unavailable. */
export function resolveDetectionDC({ dcSource, manualDC = null, hazardDC = null }) {
  const v = dcSource === "hazard" ? hazardDC : manualDC;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** pf2e degrees: 0 critical failure, 1 failure, 2 success, 3 critical success. */
export function isSuccess(degree) {
  return typeof degree === "number" && degree >= 2;
}
