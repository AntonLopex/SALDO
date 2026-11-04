/**
 * IndexedDB no puede clonar los objetos reactivos de Vue (son Proxy): lanza «DataCloneError».
 * Todo dato que llegue desde la interfaz a Dexie debe pasar por aquí. Solo admite datos JSON (sin Date, Map, etc.),
 * que es todo lo que SALDO guarda; `undefined` se descarta, que para las marcas de sincronización es equivalente a «ausente».
 */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
