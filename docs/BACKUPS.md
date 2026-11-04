# SALDO · Copias de seguridad

Tus datos viven primero en tu dispositivo (IndexedDB) y se replican en Supabase. Ninguna de las dos cosas es, por sí sola, una copia de seguridad. Estas son las capas, de más cercana a más externa:

| # | Capa | Dónde está | Te protege de | No te protege de |
|---|---|---|---|---|
| 1 | **Exportación manual** (JSON/CSV) | Un archivo que tú guardas | Casi todo, si lo guardas fuera del móvil | Olvidarte de hacerla |
| 2 | **Copias internas** (una a la semana) | Mismo navegador | Un error de la app o una restauración equivocada | Perder el móvil o borrar los datos del navegador |
| 3 | **Nube** (Supabase) | Servidores de Supabase | Perder el móvil | Borrados propagados, pausa del proyecto, cuenta comprometida. En el plan gratuito **no hay copias descargables de Supabase** |
| 4 | **Copia externa cifrada** (GitHub Actions) | Artefacto o repo privado, cifrada con tu clave | Perder la nube y el móvil a la vez | Perder la clave privada |

**Regla práctica:** exporta un JSON de vez en cuando y guárdalo en un sitio distinto del móvil (tu ordenador, un gestor de contraseñas con adjuntos, una nube personal). La capa 4 es un extra opcional.

## 1. Exportación manual (siempre disponible, sin cuenta ni Internet)

**Ajustes → Copias de seguridad → Exportar.**

- **JSON completo:** todo lo necesario para restaurar. Incluye una suma de comprobación que detecta archivos dañados o editados a mano.
  - *Sin contraseña*, el archivo contiene tus datos financieros **en texto legible**. Guárdalo en un sitio privado.
  - *Con contraseña*, se cifra con el estándar `age` (extensión `.json.age`). **Si olvidas la contraseña no hay forma de recuperarlo.**
- **CSV:** movimientos para analizar en Excel/Numbers (separador `;`, coma decimal, gastos en negativo). **No sirve para restaurar.**

En el iPhone se abre la hoja de compartir (Guardar en Archivos, AirDrop…). Si Safari no la permite, se descarga como archivo normal.

La app te recordará exportar si llevas más de 30 días sin hacerlo (y tienes movimientos).

## 2. Restaurar

**Ajustes → Copias de seguridad → Restaurar una copia → elegir archivo.**

1. Se **valida** el archivo (formato, importes enteros, fechas reales, referencias entre registros, un solo saldo de apertura, suma de comprobación). Si algo falla, **no se toca ningún dato** y verás qué falla.
2. Verás un resumen: fecha, nº de movimientos, periodo, patrimonio.
3. Al confirmar, primero se guarda una **copia interna** de lo que hay ahora (para poder volver atrás desde «Copias internas») y después se restaura.
4. Lo que existía y no está en la copia **no se borra del todo**: los movimientos se dan de baja (borrado lógico) y las categorías se archivan. Así la nube refleja el resultado y puedes recuperar algo si te equivocaste.
5. Lo restaurado se sincroniza con la nube en unos segundos.

**Cómo comprobar el estado antes y después:** anota el patrimonio y el nº de movimientos del inicio y compáralos con el resumen de la copia.
**Cómo revertir:** *Copias internas* → la más reciente «Antes de restaurar» → *Ver* → *Restaurar*.

## 3. Copias internas

Una por semana (solo si ya hay movimientos), se conservan las últimas 6, más las 3 últimas «antes de restaurar». Viven en el mismo navegador: **protegen de errores, no de perder el dispositivo**.

## 4. Copia externa cifrada con GitHub Actions (opcional)

Cada lunes (y a demanda) un flujo inicia sesión con tu cuenta, descarga **tus** datos de Supabase (RLS garantiza que solo ve los tuyos), **valida la copia y la cifra** con tu clave pública antes de guardarla. Nada se sube en texto plano.

> ⚠ **Estado:** el script y el flujo están probados en simulación local (servidor falso, cifrado y restauración de extremo a extremo, ver `tests/backup/cloud.test.ts`). **No se ha ejecutado todavía el workflow real en GitHub contra tu Supabase.** No lo des por operativo hasta completar la sección 5.

### 4.1 Requisitos
- El repositorio `Antonlopex/SALDO` creado en GitHub (si es **público**, lee el aviso de la 4.5).
- La sincronización funcionando: **solo se copia lo que ya está en la nube**. Los cambios pendientes de sincronizar no entran (compruébalo en Ajustes → Sincronización).

### 4.2 Generar las claves (en tu ordenador, una sola vez)

```bash
npm run backup:keygen
```

Muestra dos claves:
- **Pública** (`age1…`): va a GitHub. Solo sirve para cifrar.
- **Privada** (`AGE-SECRET-KEY-…`): **guárdala en tu gestor de contraseñas** y en un segundo sitio. Sin ella no se puede abrir ninguna copia. No la subas a GitHub.

### 4.3 Configurar GitHub
En el repositorio: **Settings → Secrets and variables → Actions**.

**Pestaña Variables** (valores públicos):
| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | `https://nkbqsonppmqjhletpvuq.supabase.co` |
| `SUPABASE_ANON_KEY` | tu clave `sb_publishable_…` (**nunca** la `secret`/`service_role`) |
| `AGE_RECIPIENT` | la clave **pública** `age1…` del paso anterior |

**Pestaña Secrets** (privados):
| Nombre | Valor |
|---|---|
| `BACKUP_EMAIL` | el correo de tu cuenta de SALDO |
| `BACKUP_PASSWORD` | la contraseña de esa cuenta |

> **Riesgo que asumes:** `BACKUP_PASSWORD` da acceso a tus datos. Si alguien lograra leer los secretos del repositorio, podría entrar en tu cuenta. Usa una contraseña **única y larga**, y no añadas workflows que ejecuten código de terceros (por ejemplo de *pull requests*) con acceso a secretos. Los secretos no se pasan a los *forks*.

**Opcional – repositorio privado aparte** (para conservar las copias más de 90 días y no dejarlas en el repositorio público):
1. Crea un repositorio **privado** vacío (p. ej. `SALDO-copias`).
2. Crea un *fine-grained personal access token* limitado **solo a ese repositorio**, permiso *Contents: Read and write*.
3. Variable `BACKUP_REPO` = `Antonlopex/SALDO-copias` · Secret `BACKUP_REPO_TOKEN` = el token.

### 4.4 Lanzarlo
**Actions → Copia externa cifrada → Run workflow.** Si todo va bien:
- El paso «Crear copia cifrada» muestra solo recuentos (nunca datos, contraseñas ni tokens).
- «Comprobar que el archivo está cifrado» pasa en verde.
- Aparece el artefacto `saldo-copia-cifrada` (90 días) y, si lo configuraste, un commit en el repositorio privado.

### 4.5 Avisos
- **Artefactos en un repositorio público:** pueden ser descargables por cualquier usuario autenticado de GitHub. Por eso van **cifrados**; aun así revelan que existe una copia y su tamaño. Para más discreción usa el repositorio privado.
- **Nunca** subas a un repositorio público un archivo `.json` exportado sin cifrar. El `.gitignore` bloquea los nombres habituales (`saldo-copia-*`, `*.age`, `backup-out/`), pero no te fíes solo de eso.
- GitHub puede **desactivar los flujos programados** de repositorios públicos tras un tiempo sin actividad (consulta su documentación vigente). Si dejan de llegar copias, reactívalo en la pestaña Actions.
- Un flujo semanal puede ayudar a que el proyecto de Supabase no se pause por inactividad, pero **no es una garantía**.

### 4.6 Restaurar una copia externa
1. Descarga el artefacto (zip) o el archivo del repositorio privado; obtén el `.json.age`.
2. En el proyecto, con tu clave privada:
   ```bash
   AGE_IDENTITY="AGE-SECRET-KEY-…" npm run backup:decrypt -- copia.json.age copia.json
   ```
   (También vale `--identity-file clave.txt`.) Muestra «Validación: correcta» o los problemas encontrados.
3. En la app: **Restaurar una copia → copia.json**.
4. **Borra `copia.json`** cuando termines: está en texto legible.

## 5. Lista de comprobación antes de fiarte de la copia externa
Márcalas tú; hasta entonces **no está comprobada**:
- [ ] El workflow se ejecuta en verde con «Run workflow».
- [ ] Existe el artefacto/commit con un `.json.age` de tamaño razonable.
- [ ] Lo has descifrado con tu clave privada y dice «Validación: correcta».
- [ ] Lo has restaurado en la app (mejor en un navegador de pruebas) y el patrimonio y el nº de movimientos coinciden.
- [ ] La clave privada está guardada en dos sitios.
- [ ] Han llegado al menos dos copias semanales seguidas.

## 6. Qué no cubre
- Datos que no se han sincronizado todavía (cópialos exportando a mano).
- Datos de otras cuentas: cada usuario solo ve los suyos.
- Un borrado voluntario propagado a la nube antes de la copia: se conservan las filas con borrado lógico, pero conviene mantener copias de varias semanas.

## 7. Cómo desactivarlo
En GitHub: **Actions → Copia externa cifrada → ⋯ → Disable workflow**, y elimina los secretos `BACKUP_EMAIL`, `BACKUP_PASSWORD` (y `BACKUP_REPO_TOKEN` si lo creaste). Tus datos y las exportaciones manuales no se ven afectados.
