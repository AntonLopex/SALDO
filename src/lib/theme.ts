import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'
const KEY = 'saldo-theme'

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export const themeMode = ref<ThemeMode>(read())
const mq = window.matchMedia('(prefers-color-scheme: dark)')

function apply() {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'auto' && mq.matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#101820' : '#F5F3EE')
}

export function initTheme() {
  apply()
  mq.addEventListener('change', apply)
  watch(themeMode, (m) => {
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* almacenamiento no disponible: el tema solo dura la sesión */
    }
    apply()
  })
}
