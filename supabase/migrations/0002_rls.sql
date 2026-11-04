-- SALDO · 0002 · Row Level Security
-- Cada usuario solo ve y modifica SUS filas. `anon` (visitantes sin sesión) no tiene acceso a nada.
-- Nunca se usa service_role en el frontend: esta clave se salta RLS y no debe salir del servidor.

-- Privilegios mínimos: se parte de cero y se concede solo lo necesario a `authenticated`.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;           -- sin borrado: cae en cascada con la cuenta
grant select, insert, update, delete on
  public.categories, public.transactions, public.planned_expenses, public.budgets,
  public.savings_goals, public.savings_funds, public.income_plans
  to authenticated;

-- ───────── profiles: la clave es el propio id de auth ─────────
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ───────── resto de tablas: user_id = usuario autenticado ─────────
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'transactions', 'planned_expenses', 'budgets',
                           'savings_goals', 'savings_funds', 'income_plans']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
                      using (user_id = (select auth.uid()))$p$, t || '_select_own', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
                      with check (user_id = (select auth.uid()))$p$, t || '_insert_own', t);
    execute format($p$create policy %I on public.%I for update to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t || '_update_own', t);
    execute format($p$create policy %I on public.%I for delete to authenticated
                      using (user_id = (select auth.uid()))$p$, t || '_delete_own', t);
  end loop;
end
$$;
