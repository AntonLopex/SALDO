# SALDO · Puesta en marcha de Supabase

SALDO funciona **completa sin Supabase** (todo se guarda en tu navegador). Supabase añade cuenta, copia en la nube y uso entre dispositivos. Esta guía crea el proyecto y aplica el esquema. **No hace falta pasarle a nadie contraseñas ni claves**: las configuras tú, en local y en GitHub.

> Los nombres de menús de Supabase pueden cambiar. Si algo no coincide, busca el concepto (SQL Editor, Authentication, API keys).

## 1. Crear el proyecto

1. Entra en <https://supabase.com> y crea una cuenta (con GitHub o correo).
2. **New project**. Elige una región de la UE (cercana a España) para menor latencia y mejor encaje con el RGPD.
3. Pon una **contraseña de base de datos** larga y guárdala en tu gestor de contraseñas. SALDO no la usa; solo sirve para acceso directo a la base.
4. Espera a que el proyecto termine de crearse.

## 2. Aplicar el esquema (migraciones)

En el panel: **SQL Editor → New query**. Ejecuta, **en este orden y uno por uno**, el contenido completo de:

| Orden | Archivo | Qué hace |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | Tablas, claves foráneas, restricciones, índices |
| 2 | `supabase/migrations/0002_rls.sql` | Activa seguridad por filas (RLS) y privilegios mínimos |
| 3 | `supabase/migrations/0003_triggers.sql` | `updated_at` del servidor, integridad extra, perfil automático al registrarse |

**Cómo comprobar el estado antes de empezar:** en **Table Editor** un proyecto nuevo no debe tener las tablas `profiles`, `transactions`, `categories`, `budgets`, `savings_goals`, `savings_funds`, `planned_expenses` ni `income_plans`. Si ya existen, no ejecutes las migraciones otra vez (fallarían a medias): revisa primero qué hay.

**Cómo comprobar que quedó bien:**
- Las 8 tablas aparecen en Table Editor, todas con **RLS enabled**.
- En **Database → Triggers** aparece `on_auth_user_created` sobre `auth.users`.

**Cómo revertir** (⚠ destruye todos los datos de SALDO en ese proyecto; úsalo solo en un proyecto de pruebas o si estás seguro). En SQL Editor:

```sql
drop table if exists public.transactions, public.planned_expenses, public.categories,
  public.budgets, public.savings_goals, public.savings_funds, public.income_plans, public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user(), public.set_updated_at(), public.prevent_user_change(),
  public.enforce_category_depth(), public.enforce_subcategory_parent();
```

> Estas migraciones se han probado en un Postgres real en memoria (`npm test`, carpeta `tests/db`): restricciones, triggers y aislamiento entre usuarios. Eso **no** sustituye a probarlas en tu proyecto real (paso 6).

## 3. Configurar autenticación

En **Authentication**:

- **URL Configuration → Site URL:** `https://antonlopex.github.io/SALDO/`
- **Redirect URLs:** añade `https://antonlopex.github.io/SALDO/**` y, para desarrollo, `http://localhost:5173/**`.
- **Providers → Email:** déjalo activado. Recomendado mantener **la confirmación de correo activada**. Con ella, al crear la cuenta recibirás un correo para confirmarla y después inicias sesión en la app.
- El servicio de correo integrado tiene límites de envío bajos. Si lo notas (correos que no llegan), espera unos minutos o configura tu propio SMTP.

## 4. Obtener las claves (solo las públicas)

**Project Settings → API** (o **API Keys**). Necesitas **dos** valores:

- **Project URL**: `https://xxxxxxxx.supabase.co`
- **Clave pública**: la `anon` o `publishable`.

> 🚫 **Nunca uses la clave `service_role` / `secret` en SALDO.** Se salta toda la seguridad por filas. Si la pegas por error, la app **se niega a usarla** y lo avisa. Si llegaras a publicarla, revócala/rótala desde el panel de inmediato.

## 5. Configurar la app en local

En la raíz del proyecto crea `.env.local` (está ignorado por git; nunca lo subas):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_publica
```

Reinicia `npm run dev`. En **Ajustes → Cuenta y sincronización** deja de salir "Solo en este dispositivo" y aparece el formulario de acceso.

Para el sitio publicado en GitHub Pages, los mismos dos valores irán como *variables* del repositorio (no como secretos, porque son públicos por diseño). Se configura en la Fase 8.

## 6. Verificación en tu proyecto real

1. Crea una cuenta en la app y confírmala por correo. Inicia sesión.
2. En Table Editor → `profiles` debe haber **una fila** con tu id.
3. Comprueba el aislamiento: crea una **segunda cuenta** y confirma que no ve datos de la primera (cuando la sincronización esté activa, Fase 6).
4. Si algo falla, cópiame el mensaje exacto del error (sin claves).

## Límites del plan gratuito (a fecha de esta guía; **verifícalos en <https://supabase.com/pricing>**)

Según la documentación consultada:

| Aspecto | Qué dice |
|---|---|
| Base de datos | 500 MB por proyecto activo. Cerca del límite de disco puede pasar a solo lectura. |
| Pausa por inactividad | Un proyecto gratuito con muy poca actividad durante una semana se **pausa** (avisan por correo antes). Los datos se conservan y se reactiva desde el panel. |
| Copias de seguridad | En el plan gratuito **no hay copias descargables**. Las automáticas son de planes de pago. |
| Proyectos | 2 proyectos gratuitos activos. |

Consecuencias para SALDO: **tus datos locales y las exportaciones manuales (Fase 7) son tu copia fiable**; la nube no debe ser tu única copia. Un uso diario mantiene el proyecto activo, pero tras unas vacaciones podría estar pausado.

Fuentes consultadas: [Pricing](https://supabase.com/pricing) · [¿Se pausan los proyectos inactivos?](https://supabase.com/kb/faqs/platform/free-project-pausing) · [Tamaño de base de datos](https://supabase.com/docs/guides/platform/database-size) · [Facturación](https://supabase.com/docs/guides/platform/billing-on-supabase)

## Modelo de seguridad (resumen)

- Cada tabla tiene `user_id` y **RLS forzado**: solo se ven y modifican filas propias. Visitantes sin sesión (`anon`) no tienen acceso a nada.
- Las claves foráneas son **compuestas** `(user_id, id)`: un usuario no puede referenciar categorías, gastos planificados, etc. de otro.
- `updated_at` lo pone el **servidor**: es el árbitro del orden de cambios para la sincronización (no el reloj del móvil).
- Borrado lógico (`deleted_at`) en movimientos y datos de planificación; las categorías se **archivan**, no se borran, para conservar el historial.
- Un único saldo de apertura vivo por usuario; importes siempre en céntimos y positivos.
