/** UUID v5 (SHA-1): mismo (usuario, nombre) → mismo id en todos los dispositivos. */
const NAMESPACE = 'b3b1e1c2-6f0a-4e7b-9c1d-5a1d0c0de5a1'

const hexToBytes = (hex: string) => Uint8Array.from(hex.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16)))

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export async function uuidV5(name: string): Promise<string> {
  const ns = hexToBytes(NAMESPACE)
  const nm = new TextEncoder().encode(name)
  const data = new Uint8Array(ns.length + nm.length)
  data.set(ns)
  data.set(nm, ns.length)
  const b = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x50
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Ids de entidades "únicas por usuario" (objetivos, fondos…): estables entre dispositivos. */
export const userScopedId = (userId: string, key: string) => uuidV5(`${userId}:${key}`)
