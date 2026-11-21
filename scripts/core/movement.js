/**
 * Root movement id: core splits one movement at region boundaries into segments with different ids,
 * but every later segment lists the earlier ids in `chain` (docs/spikes.md S3).
 * @param {{id?:string, chain?:string[]}|null|undefined} movement
 * @returns {string|null}
 */
export function rootMovementId(movement) {
  return movement?.chain?.[0] ?? movement?.id ?? null;
}
