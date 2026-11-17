# SALDO

Aplicación personal de finanzas y ahorro: registra un gasto en segundos desde el iPhone, mira cuánto ahorras y cómo te acercas a tu objetivo. Funciona **sin conexión** y es gratuita de mantener.

**Web publicada:** <https://antonlopex.github.io/SALDO/> · **Accesos directos:** `/nuevo-gasto` y `/nuevo-ingreso` (con `?importe=3,50&categoria=cafe`, ver [docs/IOS_ATAJOS.md](docs/IOS_ATAJOS.md))

## Qué hace
- **Registro ultrarrápido** de gastos e ingresos (importe, categoría favorita, fecha de hoy), con deshacer y duplicar. Un ingreso con categoría es un **reembolso** (p. ej. tu pareja te devuelve su mitad de un viaje): se resta de tus gastos y del presupuesto.
- **Inicio:** patrimonio, progreso hacia el objetivo, resumen del mes, presupuesto con avisos al 50/75/90/100 %, y **previsión** claramente diferenciada de los datos reales.
- **Objetivos** (15.000 / 17.000 / 20.000 €), estado «por delante / en línea / por detrás» (nunca «perdido»), fondos virtuales y gastos futuros.
- **Estadísticas** con gráficos, **movimientos** con búsqueda, filtros y calendario.
- **Sin conexión primero:** todo se guarda en el dispositivo (IndexedDB) y se sincroniza con Supabase cuando hay Internet.
- **Copias de seguridad:** exportar/importar JSON y CSV, cifrado con contraseña, copias internas semanales y copia externa cifrada opcional.

## Tecnología
Vue 3 · TypeScript estricto · Vite · Tailwind 4 · Dexie (IndexedDB) · Supabase (Auth + PostgreSQL con RLS) · ECharts · vite-plugin-pwa · Vitest · Playwright.

## Empezar
```bash
npm install
npm run dev          # http://localhost:5173  (funciona ya, sin nube)
```

Para activar la nube (cuenta y sincronización) sigue **[docs/SETUP.md](docs/SETUP.md)** y crea `.env.local` (nunca se sube a git):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...      # SOLO la clave pública. Jamás service_role / secret.
```

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprueba tipos y compila para producción (con PWA) |
| `npm run preview` | Sirve la compilación en `http://localhost:4173/SALDO/` |
| `npm run check:dist` | Verifica PWA, CSP y ausencia de secretos en `dist/` |
| `npm test` | 271 pruebas unitarias y de integración |
| `npm run test:e2e` | Pruebas en navegador real: funcionales, accesibilidad, seguridad |
| `npm run test:perf` | Presupuestos de peso y tiempo |
| `npm run test:all` | Todo lo anterior |
| `npm run icons` | Regenera los iconos PNG a partir del logotipo |
| `npm run backup:keygen` / `backup:cloud` / `backup:decrypt` | Copia externa cifrada (ver BACKUPS.md) |

## Estructura
```
src/
  app/          arranque, enrutador, App
  domain/       tipos, dinero (céntimos), fechas, valores por defecto
  engine/       motor financiero puro (patrimonio, previsión, objetivos, fondos, estadísticas)
  data/         IndexedDB (Dexie), repositorios, copias de seguridad, sincronización
  features/     pantallas (inicio, movimientos, formulario rápido, estadísticas, objetivos, ajustes…)
  components/   UI reutilizable, gráficos, marca
  lib/          tema, PWA, autenticación, Supabase (carga bajo demanda)
supabase/migrations/   esquema, RLS y triggers (probados en un Postgres real en memoria)
scripts/               iconos, verificación de dist, CSP, copia externa cifrada
tests/                 SQL/RLS, sincronización (con fuzz), copias, build, E2E
docs/                  guías
```

## Documentación
| Guía | Contenido |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Crear el proyecto de Supabase, aplicar el esquema, límites del plan gratuito |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Publicar en GitHub Pages, actualizaciones, cómo revertir |
| [docs/IOS_ATAJOS.md](docs/IOS_ATAJOS.md) | Instalar en el iPhone y el acceso directo de gasto |
| [docs/BACKUPS.md](docs/BACKUPS.md) | Exportar, restaurar y la copia externa cifrada |
| [docs/TESTING.md](docs/TESTING.md) | Qué se prueba, hallazgos, **límites** y lista de comprobación manual |

## Privacidad y seguridad
- Tus datos viven en tu dispositivo y en **tu** proyecto de Supabase, protegidos por seguridad a nivel de fila (cada usuario solo ve lo suyo).
- Sin seguimiento ni servicios de terceros. La política de seguridad de contenido solo permite hablar con la propia web y con tu proyecto de Supabase.
- El repositorio es público: contiene código, no datos. Nunca se suben claves privadas, `.env*` ni copias de seguridad (ver `.gitignore`).

## Límites conocidos
- Probada en Chromium emulando móvil; **la comprobación en un iPhone real es manual** (ver la lista en TESTING.md).
- iOS no permite sincronizar en segundo plano: la sincronización ocurre con la app abierta.
- El plan gratuito de Supabase pausa los proyectos inactivos y no incluye copias descargables: por eso existen las exportaciones propias.
