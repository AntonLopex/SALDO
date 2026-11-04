-- SALDO · 0001 · Esquema base
-- Importes SIEMPRE en céntimos (bigint). Claves UUID generadas en el cliente (idempotencia en la sincronización).
-- Cada fila lleva user_id; las claves foráneas son COMPUESTAS (user_id, id) para que un usuario
-- nunca pueda referenciar filas de otro.

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text check (char_length(display_name) <= 80),
  theme                 text not null default 'auto' check (theme in ('light', 'dark', 'auto')),
  currency              text not null default 'EUR' check (currency = 'EUR'),
  plan_start            date not null default date '2026-11-01',
  target_month          date not null default date '2027-12-01',
  saving_regular_cents  bigint not null default 100000 check (saving_regular_cents >= 0),
  saving_summer_cents   bigint not null default 60000  check (saving_summer_cents >= 0),
  summer_months         smallint[] not null default '{7,8}',
  quick_amounts_cents   bigint[] not null default '{100,200,300,500,1000,2000}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_plan_order check (target_month >= plan_start),
  constraint profiles_first_of_month check (
    extract(day from plan_start) = 1 and extract(day from target_month) = 1
  )
);

-- ───────────────────────── categories ─────────────────────────
-- "Eliminar" = archivar (archived_at): los movimientos históricos conservan su categoría.
create table public.categories (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id   uuid,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  icon        text not null default 'tag' check (char_length(icon) between 1 and 40),
  color       text not null default '#929DA5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_favorite boolean not null default false,
  fav_order   integer not null default 0,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, id),
  constraint categories_parent_fk foreign key (user_id, parent_id)
    references public.categories (user_id, id) on delete restrict,
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);

-- ───────────────────────── planned_expenses ─────────────────────────
create table public.planned_expenses (
  id                    uuid primary key,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null check (char_length(btrim(name)) between 1 and 60),
  estimated_cents       bigint not null check (estimated_cents > 0 and estimated_cents <= 100000000000),
  planned_on            date not null,
  category_id           uuid,
  subcategory_id        uuid,
  status                text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  -- Sin FK a transactions a propósito: transactions.planned_expense_id ya apunta aquí y la
  -- sincronización envía filas una a una; un ciclo de FKs bloquearía el orden de subida.
  linked_transaction_id uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (user_id, id),
  constraint planned_category_fk    foreign key (user_id, category_id)    references public.categories (user_id, id) on delete restrict,
  constraint planned_subcategory_fk foreign key (user_id, subcategory_id) references public.categories (user_id, id) on delete restrict
);

-- ───────────────────────── transactions ─────────────────────────
create table public.transactions (
  id                  uuid primary key,
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind                text not null check (kind in ('income', 'expense', 'opening', 'transfer')),
  amount_cents        bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  occurred_on         date not null,                -- fecha LOCAL del usuario, nunca un instante UTC
  category_id         uuid,
  subcategory_id      uuid,
  note                text not null default '' check (char_length(note) <= 500),
  planned_expense_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (user_id, id),
  constraint tx_category_fk    foreign key (user_id, category_id)         references public.categories (user_id, id)       on delete restrict,
  constraint tx_subcategory_fk foreign key (user_id, subcategory_id)      references public.categories (user_id, id)       on delete restrict,
  constraint tx_planned_fk     foreign key (user_id, planned_expense_id)  references public.planned_expenses (user_id, id) on delete set null (planned_expense_id)
);

-- Un único saldo de apertura vivo por usuario (no es un ingreso).
create unique index transactions_one_opening_per_user
  on public.transactions (user_id) where kind = 'opening' and deleted_at is null;

-- ───────────────────────── budgets (con vigencia) ─────────────────────────
create table public.budgets (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  valid_from   date not null check (extract(day from valid_from) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, id)
);
create unique index budgets_one_per_month on public.budgets (user_id, valid_from) where deleted_at is null;

-- ───────────────────────── savings_goals ─────────────────────────
create table public.savings_goals (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tier         text not null check (tier in ('min', 'main', 'stretch')),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  target_cents bigint not null check (target_cents > 0),
  target_date  date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, id)
);
create unique index savings_goals_one_per_tier on public.savings_goals (user_id, tier) where deleted_at is null;

-- ───────────────────────── savings_funds ─────────────────────────
-- Fondos VIRTUALES: asignaciones del patrimonio, no dinero adicional ni movimientos.
create table public.savings_funds (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('emergency', 'independence')),
  name            text not null check (char_length(btrim(name)) between 1 and 60),
  target_cents    bigint not null check (target_cents > 0),
  allocated_cents bigint not null default 0 check (allocated_cents >= 0),
  items           jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (user_id, id)
);
create unique index savings_funds_one_per_kind on public.savings_funds (user_id, kind) where deleted_at is null;

-- ───────────────────────── income_plans (añadida) ─────────────────────────
-- Ingresos PREVISTOS (alimentan previsiones; los ingresos reales son transactions).
create table public.income_plans (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  amount_cents bigint not null check (amount_cents >= 0),
  months       smallint[] not null check (
    cardinality(months) between 1 and 12 and months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]
  ),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, id)
);

-- ───────────────────────── índices de consulta y de sincronización (pull por updated_at) ─────────────────────────
create index categories_sync_idx       on public.categories       (user_id, updated_at);
create index planned_expenses_sync_idx on public.planned_expenses (user_id, updated_at);
create index transactions_sync_idx     on public.transactions     (user_id, updated_at);
create index transactions_date_idx     on public.transactions     (user_id, occurred_on) where deleted_at is null;
create index transactions_category_idx on public.transactions     (user_id, category_id) where deleted_at is null;
create index budgets_sync_idx          on public.budgets          (user_id, updated_at);
create index savings_goals_sync_idx    on public.savings_goals    (user_id, updated_at);
create index savings_funds_sync_idx    on public.savings_funds    (user_id, updated_at);
create index income_plans_sync_idx     on public.income_plans     (user_id, updated_at);
