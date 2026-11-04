# SALDO · Publicación en GitHub Pages

La app se publica en `https://antonlopex.github.io/SALDO/` (usuario `Antonlopex`, repositorio `SALDO`; el nombre del repositorio distingue mayúsculas y debe coincidir con la base `/SALDO/` de `vite.config.ts`).

> **Estado:** compilación, PWA, service worker y comprobaciones están verificados en local. **El despliegue en GitHub todavía no se ha ejecutado.** No hay nada publicado hasta que sigas estos pasos.

## 0. Requisitos y avisos
- Con el plan gratuito de GitHub, **GitHub Pages exige un repositorio público**. El código será visible: por eso nunca se suben datos ni secretos. Solo se publican la URL del proyecto y la clave pública `anon`/`publishable`, que están pensadas para ser públicas (la seguridad la dan las políticas RLS).
- Tus datos financieros **no** están en el repositorio: viven en tu dispositivo y en tu Supabase.

## 1. Subir el proyecto

Este directorio todavía no es un repositorio git. **Antes de nada comprueba qué se va a subir:**

```bash
git init -b main
git add -A
git status
```

En la lista **no deben aparecer** `.env.local`, `node_modules/`, `dist/` ni archivos `*.age` o `saldo-copia-*`. Si aparece alguno, no continúes y revisa `.gitignore`.

```bash
git commit -m "SALDO: primera versión"
git remote add origin https://github.com/Antonlopex/SALDO.git
git push -u origin main
```

(Crea antes el repositorio vacío `SALDO` en GitHub, **público**, sin README ni `.gitignore`.)

## 2. Activar Pages con GitHub Actions
En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 3. Variables del repositorio (públicas)
**Settings → Secrets and variables → Actions → pestaña *Variables***:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | `https://nkbqsonppmqjhletpvuq.supabase.co` |
| `SUPABASE_ANON_KEY` | tu clave `sb_publishable_…` (**nunca** `secret` ni `service_role`) |

Son las mismas que usa la copia externa (`docs/BACKUPS.md`). Si no las configuras, la app se publica igualmente y funciona en modo local, sin nube.

## 4. Primer despliegue
El `push` a `main` lanza el flujo **Desplegar en GitHub Pages**. También puedes ir a **Actions → Desplegar en GitHub Pages → Run workflow**.

El flujo hace, en este orden, y **solo publica si todo pasa**:
1. `npm ci` · comprobación de tipos · compilación.
2. Todas las pruebas (incluidas las del verificador de `dist`).
3. `npm run check:dist`: manifest correcto, `sw.js`, icono maskable, `404.html` de respaldo, base `/SALDO/`, **sin secretos, sin sourcemaps**.
4. Publicación en Pages.

## 5. Comprobar que quedó bien
- Abre `https://antonlopex.github.io/SALDO/` y también **directamente** `https://antonlopex.github.io/SALDO/nuevo-gasto` (debe cargar el formulario, no un error 404).
- Crea o confirma la cuenta en la web publicada (necesita que en Supabase la *Site URL* y las *Redirect URLs* incluyan `https://antonlopex.github.io/SALDO/`; ver `docs/SETUP.md`).
- En el iPhone, abre la web en Safari e instálala (ver `docs/IOS_ATAJOS.md`). Pon el móvil en modo avión y ábrela: debe cargar.

## 5b. Seguridad de la compilación (CSP) y pruebas en la nube
- La web se publica con una **política de seguridad de contenido** estricta (en un `<meta>`, porque Pages no permite cabeceras): solo scripts propios y conexión únicamente a la propia web y al **dominio exacto de tu Supabase**, tomado de la variable `SUPABASE_URL` en el momento de compilar. **Si cambias de proyecto de Supabase, actualiza esa variable y vuelve a desplegar**; si no, el navegador bloqueará la conexión.
- Además del despliegue, el flujo **Pruebas funcionales (E2E)** (`e2e.yml`) ejecuta la app en un navegador real en cada push y pull request. Va separado a propósito: no bloquea el despliegue, pero mira su resultado en la pestaña Actions.

## 6. Actualizaciones controladas
Cada `push` a `main` publica una versión nueva. Quien tenga la app abierta **no se recarga sola**: ve el aviso «Nueva versión disponible» y pulsa **Actualizar** cuando le convenga (también en Ajustes → *Buscar actualización*). La app busca versiones nuevas al volver a ella y cada hora. Tus datos locales no se tocan; los cambios de estructura de la base local se migran solos al abrir.

Para que se note qué versión tienes, sube el número en `package.json` (`version`) al publicar cambios importantes. Se muestra en Ajustes.

## 7. Cómo revertir
- **Una versión mala:** haz `git revert <commit>` y `git push` (se despliega la anterior), o en **Actions** abre el último despliegue bueno y pulsa **Re-run all jobs**.
- **Despublicar todo:** *Settings → Pages → Unpublish site*. Tus datos locales y de Supabase no se ven afectados.
- Quien tenga la versión mala ya instalada recibirá la corrección con el aviso de actualización.

## 8. Cómo funciona el modo sin conexión
- El service worker precachea todos los archivos de la app (~1,4 MB) en la primera visita; después abre sin conexión, incluida la ruta `/nuevo-gasto`.
- Las llamadas a Supabase **no se cachean**: los datos viven en IndexedDB y se sincronizan al volver la conexión.
- iOS no permite sincronizar en segundo plano: la sincronización ocurre con la app abierta.

## Problemas frecuentes
| Síntoma | Causa probable |
|---|---|
| La web carga en blanco o sin estilos | La base no coincide con el nombre del repositorio (`/SALDO/`, mayúsculas) |
| `/nuevo-gasto` da 404 | Falta `404.html` en `dist` (el flujo lo detecta y no publica) |
| El flujo falla en «Comprobar PWA y ausencia de secretos» | Lee el mensaje: indica qué archivo o patrón sospechoso hay |
| La app publicada no muestra el formulario de cuenta | Faltan las variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| Tras publicar no veo los cambios | Pulsa **Actualizar** en el aviso, o *Buscar actualización* en Ajustes |
