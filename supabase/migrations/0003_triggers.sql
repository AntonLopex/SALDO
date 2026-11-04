-- SALDO · 0003 · Triggers de integridad y sincronización

-- 1) updated_at lo fija SIEMPRE el servidor: es el árbitro del orden de cambios (no el reloj del iPhone).
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

-- 2) Nadie puede reasignar una fila a otro usuario.
create or replace function public.prevent_user_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id no se puede modificar' using errcode = '42501';
  end if;
  return new;
end
$$;

-- 3) Las categorías tienen un solo nivel (categoría → subcategoría).
create or replace function public.enforce_category_depth() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories p where p.id = new.parent_id and p.user_id = new.user_id and p.parent_id is not null) then
      raise exception 'Las subcategorías no pueden tener subcategorías' using errcode = '23514';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id and c.user_id = new.user_id) then
      raise exception 'Una categoría con subcategorías no puede convertirse en subcategoría' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

-- 4) La subcategoría de un movimiento (o gasto planificado) debe pertenecer a su categoría.
create or replace function public.enforce_subcategory_parent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.subcategory_id is not null then
    if new.category_id is null or not exists (
      select 1 from public.categories s
      where s.id = new.subcategory_id and s.user_id = new.user_id and s.parent_id = new.category_id
    ) then
      raise exception 'La subcategoría no pertenece a la categoría indicada' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'categories', 'transactions', 'planned_expenses', 'budgets',
                           'savings_goals', 'savings_funds', 'income_plans']
  loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);
    if t <> 'profiles' then
      execute format('create trigger %I before update on public.%I for each row execute function public.prevent_user_change()',
                     t || '_prevent_user_change', t);
    end if;
  end loop;
end
$$;

create trigger categories_enforce_depth before insert or update on public.categories
  for each row execute function public.enforce_category_depth();
create trigger transactions_enforce_sub before insert or update on public.transactions
  for each row execute function public.enforce_subcategory_parent();
create trigger planned_enforce_sub before insert or update on public.planned_expenses
  for each row execute function public.enforce_subcategory_parent();

-- 5) Cada cuenta nueva recibe su perfil automáticamente.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
