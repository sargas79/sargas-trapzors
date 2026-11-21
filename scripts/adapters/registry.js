/**
 * Pure adapter selection (plan section 12).
 * @param {string} systemId
 * @param {{generic:object, bySystem:Record<string,object>}} registry
 * @returns {{adapter:object, fallback:boolean, supported:boolean}}
 */
export function selectAdapter(systemId, registry) {
  const mapped = registry.bySystem?.[systemId];
  if (mapped) return { adapter: mapped, fallback: false, supported: true };
  return { adapter: registry.generic, fallback: true, supported: false };
}
