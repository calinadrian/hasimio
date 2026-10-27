// Bump when the engine's HTTP API changes in a way older UIs or engines cannot handle.
export const ENGINE_API_VERSION=1;
export function engineCompatible(health,required=ENGINE_API_VERSION) {
  return Boolean(health&&health.available===true&&Number.isInteger(health.apiVersion)&&health.apiVersion>=required);
}
