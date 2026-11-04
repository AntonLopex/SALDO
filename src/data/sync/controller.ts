import { liveQuery } from 'dexie'
import { ref, watch } from 'vue'
import { session } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resetBackoff, runSync, syncSnapshot, type SyncReport, type SyncSnapshot } from './engine'
import { supabaseRemote } from './remote'

export type SyncStatus =
  | 'disabled' // sin Supabase o sin sesión: solo local
  | 'idle' // todo al día
  | 'syncing'
  | 'offline'
  | 'error' // fallo temporal del servidor: se reintenta solo
  | 'auth' // hay que volver a iniciar sesión
  | 'attention' // requiere decisión o hay elementos rechazados

export const syncStatus = ref<SyncStatus>('disabled')
export const syncMessage = ref('')
export const syncSnap = ref<SyncSnapshot>({ pending: 0, blocked: 0, conflicts: 0, lastSyncAt: null, failing: [] })

const DEBOUNCE_MS = 1500
const POLL_MS = 60_000
let started = false
let running = false
let rerun = false
let debounce: ReturnType<typeof setTimeout> | undefined
let retry: ReturnType<typeof setTimeout> | undefined
let failures = 0

const canSync = () => !!supabase && !!session.value?.user

function schedule(ms: number) {
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), ms)
}

function apply(rep: SyncReport) {
  syncMessage.value = rep.message
  clearTimeout(retry)
  switch (rep.outcome) {
    case 'ok':
      failures = 0
      syncStatus.value = rep.blocked > 0 || syncSnap.value.blocked > 0 ? 'attention' : 'idle'
      return
    case 'account-mismatch':
    case 'needs-decision':
      syncStatus.value = 'attention'
      return
    case 'auth':
      syncStatus.value = 'auth'
      return
    case 'offline':
    case 'error': {
      syncStatus.value = rep.outcome
      failures++
      // espera creciente: 15 s, 30 s, 1 min, … tope 5 min
      retry = setTimeout(() => void syncNow(), Math.min(15_000 * 2 ** (failures - 1), 300_000))
    }
  }
}

/** Un solo ciclo a la vez (entre pestañas también, si el navegador soporta Web Locks). */
export async function syncNow(): Promise<void> {
  if (!canSync()) {
    syncStatus.value = 'disabled'
    return
  }
  if (!navigator.onLine) {
    syncStatus.value = 'offline'
    syncMessage.value = 'Sin conexión. Se sincronizará al volver Internet.'
    return
  }
  if (running) {
    rerun = true
    return
  }
  running = true
  syncStatus.value = 'syncing'
  try {
    const exec = async () => {
      const rep = await runSync({ remote: supabaseRemote(supabase!), userId: session.value!.user.id })
      syncSnap.value = await syncSnapshot()
      apply(rep)
    }
    if (navigator.locks) await navigator.locks.request('saldo-sync', { ifAvailable: true }, async (lock) => { if (lock) await exec(); else syncStatus.value = 'idle' })
    else await exec()
  } finally {
    running = false
    if (rerun) {
      rerun = false
      schedule(DEBOUNCE_MS)
    }
  }
}

export async function retryNow(): Promise<void> {
  await resetBackoff()
  failures = 0
  await syncNow()
}

export function startSyncController(): void {
  if (started) return
  started = true
  // Estado de la cola siempre al día; cualquier cambio local pendiente dispara una sincronización.
  let lastPending = 0
  liveQuery(syncSnapshot).subscribe({
    next: (snap) => {
      syncSnap.value = snap
      if (canSync() && snap.pending > lastPending) schedule(DEBOUNCE_MS)
      lastPending = snap.pending
    },
    error: (e) => console.error('syncSnapshot', e),
  })
  watch(
    () => session.value?.user.id,
    (id) => {
      if (id) void syncNow()
      else {
        syncStatus.value = 'disabled'
        syncMessage.value = ''
      }
    },
    { immediate: true },
  )
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => canSync() && (syncStatus.value = 'offline'))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && canSync() && void syncNow())
  setInterval(() => canSync() && syncSnap.value.pending > 0 && !running && void syncNow(), POLL_MS)
}
