/** Sentinel used when a movement id is unavailable. */
export const NO_MOVEMENT = "no-movement";

/** Stable key for a (trap, token, movement) triple. */
export function makeTriggerKey(trapId, tokenId, movementId) {
  return `${trapId}|${tokenId}|${movementId ?? NO_MOVEMENT}`;
}

/** TTL-based seen-set with an injectable clock. */
export function createDeduper({ ttlMs = 60000, now = () => Date.now() } = {}) {
  const seen = new Map();
  const live = (key) => {
    const t = seen.get(key);
    if (t === undefined) return false;
    if (now() - t >= ttlMs) { seen.delete(key); return false; }
    return true;
  };
  return {
    has: (key) => live(key),
    add(key) { seen.set(key, now()); },
    /** @returns {boolean} true if the key was new */
    checkAndAdd(key) {
      if (live(key)) return false;
      seen.set(key, now());
      return true;
    },
    prune() {
      const t = now();
      for (const [k, at] of seen) if (t - at >= ttlMs) seen.delete(k);
    }
  };
}

/**
 * Collects entries per trap and flushes each batch once, windowMs after that trap's FIRST entry.
 * @param {{windowMs?:number, setTimer:Function, clearTimer:Function, onFlush:(trapId:string, entries:any[])=>void}} opts
 */
export function createBatcher({ windowMs = 300, setTimer, clearTimer, onFlush }) {
  const batches = new Map(); // trapId -> {entries, timer}
  const flush = (trapId) => {
    const b = batches.get(trapId);
    if (!b) return;
    batches.delete(trapId);
    clearTimer(b.timer);
    onFlush(trapId, b.entries);
  };
  return {
    add(trapId, entry) {
      let b = batches.get(trapId);
      if (!b) {
        b = { entries: [], timer: null };
        batches.set(trapId, b);
        b.timer = setTimer(() => flush(trapId), windowMs);
      }
      b.entries.push(entry);
    },
    flushAll() { for (const id of [...batches.keys()]) flush(id); },
    cancel(trapId) {
      const b = batches.get(trapId);
      if (!b) return;
      clearTimer(b.timer);
      batches.delete(trapId);
    }
  };
}
