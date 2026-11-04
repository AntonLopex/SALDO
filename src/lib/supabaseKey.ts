/**
 * Defensa en profundidad: el frontend solo debe llevar la clave pública (anon / publishable).
 * Si por error se configura una clave de servicio, la app se niega a usarla.
 */
export type KeyKind = 'public' | 'secret' | 'unknown'

function jwtRole(key: string): string | null {
  const part = key.split('.')[1]
  if (!part) return null
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

export function classifyKey(key: string): KeyKind {
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return 'secret'
  if (k.startsWith('sb_publishable_')) return 'public'
  const role = jwtRole(k)
  if (role === 'service_role') return 'secret'
  if (role === 'anon') return 'public'
  return 'unknown'
}
