import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/** ¿La app está abierta como app instalada (sin barra de Safari)? */
export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIos = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// ───────────────────────── service worker y actualizaciones ─────────────────────────

const CHECK_EVERY_MS = 60 * 60 * 1000
let registration: ServiceWorkerRegistration | undefined

const sw = useRegisterSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    registration = reg
    if (!reg) return
    setInterval(() => void reg.update().catch(() => undefined), CHECK_EVERY_MS)
  },
  onRegisterError(e) {
    console.warn('No se pudo registrar el service worker', e)
  },
})

/** Hay una versión nueva descargada y en espera. */
export const needRefresh = sw.needRefresh
/** La app ya está guardada para funcionar sin conexión (se avisa una sola vez). */
export const offlineReady = sw.offlineReady
/** Activa la versión nueva y recarga. Solo se llama cuando el usuario lo pide. */
export const applyUpdate = () => sw.updateServiceWorker(true)
export const dismissUpdate = () => { needRefresh.value = false }
export const dismissOfflineReady = () => { offlineReady.value = false }

/** Busca una versión nueva (al volver a la app, por ejemplo). */
export const checkForUpdate = () => registration?.update().catch(() => undefined)

// ───────────────────────── almacenamiento persistente ─────────────────────────

export type Persistence = 'granted' | 'denied' | 'unsupported'
export const persistence = ref<Persistence | 'unknown'>('unknown')

/**
 * Pide al navegador que no borre los datos locales cuando falte espacio. Sin esto Safari puede limpiar el
 * almacenamiento de webs que no se usan durante un tiempo; instalada en la pantalla de inicio esa limpieza no aplica.
 */
export async function requestPersistence(): Promise<void> {
  if (!navigator.storage?.persist) { persistence.value = 'unsupported'; return }
  try {
    const already = await navigator.storage.persisted()
    persistence.value = already || (await navigator.storage.persist()) ? 'granted' : 'denied'
  } catch {
    persistence.value = 'unsupported'
  }
}

// ───────────────────────── instalación (Chrome/Android/escritorio) ─────────────────────────

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let deferred: InstallPromptEvent | null = null
export const canPromptInstall = ref(false)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  canPromptInstall.value = true
})
window.addEventListener('appinstalled', () => { deferred = null; canPromptInstall.value = false })

export async function promptInstall(): Promise<void> {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  canPromptInstall.value = false
}
