# SALDO · Pruebas, hallazgos y límites

Este documento dice **qué se ha probado, cómo, qué se encontró y qué NO se ha podido comprobar**. Está pensado para que no des por cierto lo que no lo está.

## Resumen

| Capa | Herramienta | Pruebas | Qué cubre |
|---|---|---|---|
| Unitarias + integración | Vitest | **267** (17 archivos) | Cálculos, esquema SQL y RLS, sincronización, copias, seguridad de la compilación, parámetros de URL, ingresos pendientes |
| Funcionales, accesibilidad, seguridad | Playwright | **72** | La app real en un navegador: flujo diario, accesos directos, ajustes, sin conexión, copias, WCAG, CSP |
| Rendimiento | Playwright | **6** | Peso del arranque y tiempos con CPU 4× más lenta |

Cómo ejecutarlas:

```bash
npm test             # unitarias e integración (necesita `npm run build` antes para las pruebas de dist)
npm run build        # las pruebas E2E se ejecutan sobre esta compilación
npm run test:e2e     # funcionales + accesibilidad + seguridad (en paralelo)
npm run test:perf    # rendimiento (de una en una: sus tiempos se falsean si compiten por la CPU)
npm run test:all     # todo, en ese orden
```

E2E usa Google Chrome instalado (`channel: 'chrome'`); en CI usa el Chromium de Playwright. En la nube corren el flujo `deploy.yml` (tipos, compilación, unitarias, `check:dist`) y `e2e.yml` (E2E).

## Qué se prueba, por áreas

### Cálculos financieros (`src/engine`, `src/domain`)
- Casos concretos con las cifras reales del plan (apertura 3.860,14 €; 13.200 € de ahorro previsto; previsión a dic-2027 de 17.081,14 €).
- **15 propiedades con 200 casos aleatorios cada una** (semilla fija, reproducibles): el patrimonio es siempre apertura + ingresos − gastos; las transferencias y borrados nunca cuentan; la suma de meses = totales; gastos por categoría suman 100 %; un gasto dentro del presupuesto no cambia la previsión y el exceso la baja *exactamente*; un gasto planificado realizado no se cuenta dos veces; los fondos nunca suman patrimonio extra; importes en céntimos enteros sin errores de coma flotante.

### Base de datos y seguridad por filas (`tests/db`)
Las migraciones SQL se ejecutan **tal cual** en un Postgres real en memoria (PGlite): aislamiento entre usuarios (no ven, insertan, modifican ni borran lo de otro), claves foráneas compuestas, restricciones (importes > 0, un único saldo de apertura, un presupuesto por mes…), triggers, `updated_at` del servidor, perfil automático, y que `anon` no accede a nada.

### Sincronización offline-first (`tests/sync`)
- 25 casos con un servidor simulado: la cola solo se vacía tras la confirmación; corte de red; confirmación perdida (el reenvío no duplica); edición mientras se envía; un dato rechazado no bloquea a los demás; sesión caducada; conflictos; dispositivo nuevo; cuentas distintas.
- **Fuzz**: 25 historias aleatorias × 30 operaciones, mezcladas con 355 sincronizaciones y fallos inyectados (71 sin conexión, 45 fallos de servidor, 56 confirmaciones perdidas, 29 rechazos). Al final se exige convergencia exacta con la nube y con un segundo dispositivo.

### Copias de seguridad (`src/data/backup`, `tests/backup`)
Formato, checksum, validación de integridad, CSV (incluida la inyección de fórmulas), cifrado, restauración y copias internas; y el flujo externo de extremo a extremo (descarga → validación → cifrado → descifrado → restauración) contra un servidor simulado.

### La app en un navegador real (`tests/e2e`)
- **Flujo diario:** primera vez, `/nuevo-gasto` directo, registrar un café, validaciones, deshacer, duplicar, editar, eliminar, buscar, calendario.
- **Accesos directos** (`acceso-directo.spec.ts`): `/nuevo-ingreso`, y los parámetros `tipo`, `importe`, `categoria`, `nota`. Garantiza que **un enlace solo rellena el formulario y nunca guarda** (probado con mutación: si `?guardar=1` guardara, la prueba falla), que los valores no válidos o ambiguos se ignoran, que una nota con HTML no ejecuta nada y que funcionan sin conexión. Lo que hace iOS con Atajos, iconos y widgets **no** está cubierto (ver `docs/IOS_ATAJOS.md`).
- **Ingresos pendientes** (`ingresos-pendientes.spec.ts`): la tarjeta «Ingresos previstos pendientes» del inicio, que «Registrar» abre el ingreso relleno **sin guardar**, que cada ingreso registrado sale de la lista (por importe exacto, por el total junto o por cobro parcial), que el ahorro del mes no se muestra mientras no haya ingresos (en vez de un negativo engañoso), y que la tarjeta y la previsión nunca se contradicen (propiedad probada con 300 casos aleatorios). Las pruebas se adaptan al mes en que se ejecutan (julio y agosto no tienen el ingreso del fútbol).
- **Ajustes y datos:** plan, objetivos, gastos futuros enlazados, fondos, categorías, tema, `prefers-reduced-motion`, **sin conexión con el service worker real (con el servidor apagado)**, exportar/importar/restaurar, copia cifrada.
- **Móvil y accesibilidad:** sin desbordes de 320 a 430 px, campos de ≥ 16 px (iOS hace zoom por debajo), zonas táctiles ≥ 44 px, **axe-core WCAG 2.1 AA sin infracciones en 11 pantallas × tema claro y oscuro**, y uso con teclado.
- **Seguridad:** política CSP activa (bloquea scripts en línea y conexiones a dominios ajenos), sin cookies ni tokens, y una copia importada **con checksum válido y un nombre de categoría malicioso** no ejecuta nada.

### Verificador de la compilación (`npm run check:dist`)
Manifest, iconos, `404.html`, base `/SALDO/`, CSP estricta, sin scripts en línea, sin sourcemaps, y sin secretos *reales* (valores de claves, no palabras). Tiene sus propias pruebas que inyectan cada problema y comprueban que falla.

## Cómo sé que las pruebas sirven (mutaciones)
Una prueba que siempre pasa no demuestra nada. En varios puntos críticos se **rompió a propósito el código** y se comprobó que las pruebas fallan, y luego se restauró:
- Sin el orden «borrados primero» al subir, restaurar una copia con otro saldo de apertura se bloquea → falla la prueba de restauración.
- Sin `plain()`, `DataCloneError` → fallan las 3 pruebas de regresión.
- Sin escapar el HTML de los tooltips → fallan las unitarias y la E2E del ataque.
- Con una regla de presupuesto rota en la previsión → falla la propiedad (con su semilla).
- Con la idempotencia rota (id nuevo en cada envío) → el fuzz falla en la primera semilla.

## Hallazgos de la Fase 9 (todos corregidos)

| # | Hallazgo | Gravedad | Cómo se encontró | Corrección |
|---|---|---|---|---|
| 1 | **No se podían guardar asignaciones de fondos ni restaurar una copia desde la pantalla** (`DataCloneError`: la interfaz pasaba objetos reactivos de Vue a IndexedDB) | Alta | E2E (las pruebas unitarias usaban objetos planos y no lo veían) | `plain()` en la capa de datos + 3 pruebas de regresión |
| 2 | **Tema claro con contraste insuficiente** (verde 3,2–3,5:1; rojo 3,5–4,2:1; AA exige 4,5:1) | Media | axe-core | Verde `#14734F`, rojo `#B93429`, ámbar `#855700` (≥ 4,8:1 medido en todos los fondos) |
| 3 | **Nombres de categoría sin escapar en los tooltips** de los gráficos (HTML ejecutable desde una copia importada manipulada) | Media | Revisión de código + prueba del ataque | Escape de HTML + CSP |
| 4 | Zonas táctiles pequeñas (chip de estado 28 px; selector de meses 19 px de ancho) | Media | Auditoría móvil | 44 px; selector de meses en 4 columnas con nombre completo para lectores de pantalla |
| 5 | Filtros de Movimientos a 14 px (iOS hace zoom al enfocar) | Baja | Auditoría móvil | 16 px |
| 6 | **Sin política de seguridad de contenido** | Media | Revisión | CSP estricta (ver abajo) |
| 7 | **Arranque pesado**: 193 KB de JS comprimido, de los que ~111 KB eran la nube y el cifrado | Media | Medición | Carga bajo demanda: **103 KB (−47 %)** |
| 8 | **Lista de movimientos lenta**: 500 movimientos tardaban 3,5–5,1 s en pintarse con CPU 4× más lenta | Media | Medición | Se pinta por tandas de 100 con «Mostrar más»: 1,2–1,6 s |
| 9 | Dependencia `pinia` registrada pero sin usar | Baja | Medición del bundle | Eliminada |
| 10 | El verificador de `dist` daba «OK» estando roto (el shell estropeó su código) | Media | Revisión | Reescrito y con pruebas de mutación |

## Seguridad: estado
- **Dependencias de producción:** `npm audit --omit=dev` → **0 vulnerabilidades** (en el momento de esta revisión; repítelo con `npm audit`).
- **Herramientas de desarrollo:** `npm audit` muestra **10 avisos (2 bajos, 8 moderados, 0 altos/críticos)**, todos en una sola cadena de compilación: `vite-plugin-pwa` → `workbox-build` → `ejs`/`jake`/`glob`/`minimatch`/`deepmerge`. Solo se ejecutan al compilar, sobre entradas propias, y nada de eso llega a la web publicada. **Riesgo aceptado, no ignorado:** el único «arreglo» que ofrece npm es *bajar* a `vite-plugin-pwa@1.1.0`, que no admite Vite 8. Revísalo cuando salga una versión nueva de `workbox-build`. (Se eliminó `@vue/test-utils`, que estaba instalado sin usarse y añadía 3 avisos.)
- **Secretos:** ninguno en el código ni en todo el historial de git (solo una cadena de prueba en un test).
- **Código:** sin `v-html`, `innerHTML`, `eval` ni `new Function`.
- **CSP** (`<meta>`, solo en la compilación): `script-src 'self'`, `style-src 'self'`, `connect-src 'self'` + el dominio **exacto** de tu proyecto de Supabase, sin `unsafe-inline` ni `unsafe-eval`, `object-src 'none'`. Para que cumpla, las fuentes ya no se incrustan como `data:` y el script del tema es un archivo propio.
- **Datos:** `localStorage` solo guarda ajustes de la app; sin cookies; sin llamadas a terceros.
- **RLS:** probada con Postgres real (24 casos).

### Límites de seguridad que conviene conocer
- **No se puede fijar `frame-ancestors`** (anti-embebido): GitHub Pages no permite cabeceras HTTP y esa directiva se ignora en un `<meta>`. Riesgo bajo, pero real. Si algún día quieres cerrarlo, habría que servir la app detrás de un proxy que añada cabeceras.
- **Configuración de Supabase Auth** (longitud mínima de contraseña, protección contra contraseñas filtradas, límites de envío de correo): no se puede comprobar desde el repositorio. Revísala en tu panel de Supabase.
- **`BACKUP_PASSWORD` en GitHub Secrets** (copia externa): quien consiga leer los secretos del repositorio podría entrar en tu cuenta. Ver `docs/BACKUPS.md`.
- Los datos locales **no están cifrados en el dispositivo** (IndexedDB en claro): protege el móvil con código y cifrado de iOS.

## Rendimiento: números medidos
Con la CPU 4× más lenta (simula un móvil modesto), sobre la compilación de producción y ejecutando las pruebas de una en una:

| Medida | Resultado |
|---|---|
| JS de arranque (gzip) | **103 KB** (antes: ~193 KB) |
| CSS (gzip) | 6,5 KB |
| Fuentes descargadas | 1 archivo (26,7 KB) |
| Primera visita → formulario utilizable | 1,4–2,3 s |
| Visita repetida (service worker) | 0,9–1,3 s |
| Guardar un gasto | 0,2–0,45 s |
| Lista con 500 movimientos | 1,2–1,6 s |

**Cómo leerlos:** los presupuestos de peso (bytes) son deterministas y bloquean. Los de tiempo son «alarmas de regresión» holgadas (≈ 2× lo medido en el peor caso), porque los tiempos de un ordenador compartido son ruidosos. No miden una red móvil real (`vite preview` no comprime, GitHub Pages sí).

## Lo que NO se ha comprobado

1. **Safari/iPhone real.** Las pruebas usan Chromium emulando un móvil (pantalla, táctil), no WebKit. Hay que comprobar a mano lo específico de iOS (lista abajo).
2. **El workflow de copia externa en GitHub** (`backup.yml`): su script y su cifrado están probados en simulación, pero no se ha ejecutado contra tu Supabase real.
3. **Concurrencia real entre dos dispositivos con la nube real.** El fuzz y las pruebas la simulan; la sincronización de un dispositivo con tu Supabase real la comprobaste tú a mano.
4. **Cambios de hora (verano/invierno) y medianoche.** Las fechas se guardan como texto local `AAAA-MM-DD`, lo que evita la mayoría de problemas, pero no hay pruebas específicas de esos instantes.
5. **Regresión visual** (comparar capturas): no existe; se revisaron a ojo las pantallas principales en claro.
6. **Volúmenes mayores** (miles de movimientos al año durante años): se probaron 500; más allá, no medido.
7. **Lector de pantalla real** (VoiceOver): axe verifica las reglas automáticas (que cubren una parte de los problemas), no la experiencia.

## Lista de comprobación manual en el iPhone
Márcala tú; hasta entonces estos puntos no están verificados.

**Instalación y arranque**
- [ ] Safari → Compartir → Añadir a pantalla de inicio. Se ve a pantalla completa, con el icono correcto.
- [ ] El contenido respeta la isla/muesca arriba y la barra de inicio abajo (no queda tapado).
- [ ] Modo avión: la app abre y se puede registrar un gasto.

**Registro rápido**
- [ ] `/nuevo-gasto` (como icono o por Atajos) abre el formulario; al tocar el importe sale el teclado numérico.
- [ ] El teclado no tapa el botón Guardar. Al enfocar un campo, la pantalla **no hace zoom**.
- [ ] Guardar → confirmación → «Abrir SALDO» → el patrimonio cambia.

**Datos y copias**
- [ ] Exportar JSON: sale la hoja de compartir (o se guarda en Archivos).
- [ ] Importar desde la app Archivos; la vista previa es correcta; restaurar funciona.
- [ ] Con copia cifrada: pide la contraseña.

**Cuenta y sincronización**
- [ ] Iniciar sesión en la web publicada; el icono de nube pasa a verde.
- [ ] Gasto sin conexión → al volver Internet y abrir la app, se sincroniza.
- [ ] Un segundo dispositivo (o el navegador de escritorio) recibe los datos.

**Aspecto y accesibilidad**
- [ ] Modo claro, oscuro y automático.
- [ ] Texto grande del sistema (Ajustes → Pantalla y brillo → Tamaño del texto): nada se corta.
- [ ] VoiceOver: se puede registrar un gasto.

**Copia externa**
- [ ] Ejecutar `backup.yml` a mano y completar la lista de `docs/BACKUPS.md`.
