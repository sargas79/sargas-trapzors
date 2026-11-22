// Pure compendium-browser helpers (no Foundry globals). Unit-tested in tests/hazard-browser.test.js.
import { hazardKind } from "./hazard-info.js";

/**
 * @typedef {object} HazardEntry
 * @property {string} uuid @property {string} name @property {string} img @property {number} level
 * @property {string[]} traits @property {string} kind @property {boolean} isComplex
 * @property {number|null} stealthDC @property {string} pack @property {string} packTitle
 */

/** Build a browser entry from a compendium index record (fields as requested from getIndex). */
export function buildHazardEntry(rec, pack) {
  const traits = [...(rec?.system?.traits?.value ?? [])].map(String);
  const level = Number(rec?.system?.details?.level?.value);
  // Index records hold the source data: stealth.value is the modifier (DC = value + 10); dc only exists on prepared actors.
  const stealth = rec?.system?.attributes?.stealth ?? {};
  const dc = typeof stealth.dc === "number" ? stealth.dc : typeof stealth.value === "number" ? stealth.value + 10 : null;
  return {
    uuid: rec.uuid ?? `Compendium.${pack.collection}.Actor.${rec._id}`,
    name: String(rec.name ?? ""),
    img: rec.img ?? "",
    level: Number.isFinite(level) ? level : 0,
    traits,
    kind: hazardKind(traits),
    isComplex: !!rec?.system?.details?.isComplex,
    stealthDC: typeof dc === "number" && Number.isFinite(dc) ? dc : null,
    pack: pack.collection,
    packTitle: pack.title ?? pack.collection
  };
}

const toNum = (v) => {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Filter hazard entries. Does not mutate the input.
 * @param {HazardEntry[]} entries
 * @param {{kind?:string, levelMin?:any, levelMax?:any, complexity?:"all"|"simple"|"complex", query?:string, pack?:string}} f
 */
export function filterHazards(entries, f = {}) {
  const kind = f.kind ?? "all";
  const min = toNum(f.levelMin);
  const max = toNum(f.levelMax);
  const complexity = f.complexity ?? "all";
  const query = String(f.query ?? "").trim().toLowerCase();
  const pack = f.pack ?? "all";
  return (entries ?? []).filter((e) => {
    if (kind !== "all" && e.kind !== kind) return false;
    if (min !== null && e.level < min) return false;
    if (max !== null && e.level > max) return false;
    if (complexity === "simple" && e.isComplex) return false;
    if (complexity === "complex" && !e.isComplex) return false;
    if (pack !== "all" && e.pack !== pack) return false;
    if (query && !e.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

/** Sort by level, then name. Returns a new array. */
export function sortHazards(entries) {
  return [...(entries ?? [])].sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
}
