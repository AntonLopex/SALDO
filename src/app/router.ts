import { createRouter, createWebHistory } from 'vue-router'

const ONBOARDED_KEY = 'saldo-onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true // sin almacenamiento no podemos recordarlo: no bloqueamos al usuario
  }
}
export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* ignorado */
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    /** 'bare' = sin cabecera ni barra inferior */
    layout?: 'app' | 'bare'
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'inicio', component: () => import('@/features/dashboard/HomeView.vue') },
    { path: '/movimientos', name: 'movimientos', component: () => import('@/features/transactions/TransactionsView.vue') },
    { path: '/movimientos/:id', name: 'editar-movimiento', component: () => import('@/features/quick-add/QuickAddView.vue'), meta: { layout: 'bare' } },
    { path: '/ajustes/copias', name: 'copias', component: () => import('@/features/settings/BackupView.vue') },
    { path: '/ajustes/sincronizacion', name: 'sincronizacion', component: () => import('@/features/settings/SyncView.vue') },
    { path: '/ajustes/cuenta', name: 'cuenta', component: () => import('@/features/settings/AccountView.vue') },
    { path: '/ajustes/plan', name: 'plan', component: () => import('@/features/settings/PlanSettingsView.vue') },
    { path: '/ajustes/categorias', name: 'categorias', component: () => import('@/features/settings/CategoriesView.vue') },
    { path: '/estadisticas', name: 'estadisticas', component: () => import('@/features/stats/StatsView.vue') },
    { path: '/objetivos', name: 'objetivos', component: () => import('@/features/goals/GoalsView.vue') },
    { path: '/ajustes', name: 'ajustes', component: () => import('@/features/settings/SettingsView.vue') },
    { path: '/anadir', name: 'anadir', component: () => import('@/features/quick-add/QuickAddView.vue'), meta: { layout: 'bare' } },
    // Ruta independiente para el atajo de iOS: solo el formulario rápido.
    { path: '/nuevo-gasto', name: 'nuevo-gasto', component: () => import('@/features/quick-add/QuickAddView.vue'), meta: { layout: 'bare' } },
    { path: '/bienvenida', name: 'bienvenida', component: () => import('@/features/onboarding/WelcomeView.vue'), meta: { layout: 'bare' } },
    { path: '/:pathMatch(.*)*', name: 'no-encontrada', component: () => import('@/features/ErrorView.vue'), meta: { layout: 'bare' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  // El atajo /nuevo-gasto nunca se interpone con la bienvenida.
  if (to.name === 'nuevo-gasto' || to.name === 'bienvenida' || to.name === 'no-encontrada') return true
  if (!isOnboarded()) return { name: 'bienvenida' }
  return true
})
