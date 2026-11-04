import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import { initTheme } from '@/lib/theme'
import { startData } from '@/data/appData'
import { initAuth } from '@/lib/auth'
import { startSyncController } from '@/data/sync/controller'
import { checkForUpdate, requestPersistence } from '@/lib/pwa'
import '@/design/tokens.css'
import App from './App.vue'

initTheme()
void initAuth() // recupera la sesión si hay Supabase configurado
void startData()
startSyncController() // sincroniza cuando hay sesión; sin sesión no hace nada // abre IndexedDB y precarga categorías en el primer uso
void requestPersistence() // pide que el navegador no borre los datos locales
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkForUpdate())
createApp(App).use(createPinia()).use(router).mount('#app')
