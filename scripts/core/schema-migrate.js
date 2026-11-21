import { CURRENT_SCHEMA_VERSION } from "./constants.js";
import { defaultTrapSystem } from "./trap-defaults.js";

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Fill missing keys from defaults without overwriting existing values. Returns a new value. */
function fill(data, defaults) {
  if (!isPlain(defaults) || !isPlain(data)) return structuredClone(data);
  const out = {};
  for (const key of Object.keys(data)) out[key] = structuredClone(data[key]);
  for (const key of Object.keys(defaults)) {
    if (!(key in out) || out[key] === undefined) out[key] = structuredClone(defaults[key]);
    else if (isPlain(defaults[key]) && isPlain(out[key])) out[key] = fill(out[key], defaults[key]);
  }
  return out;
}

/**
 * @returns {{data:object, migrated:boolean, unsupported?:boolean}}
 */
export function migrateTrapSystem(data) {
  const version = data?.schemaVersion;
  if (typeof version === "number" && version > CURRENT_SCHEMA_VERSION) {
    return { data, migrated: false, unsupported: true };
  }
  const filled = fill(data ?? {}, defaultTrapSystem());
  filled.schemaVersion = CURRENT_SCHEMA_VERSION;
  const migrated = JSON.stringify(filled) !== JSON.stringify(data);
  return { data: filled, migrated };
}
