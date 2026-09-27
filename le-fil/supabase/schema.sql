-- Le Fil — schéma Supabase (schéma Postgres dédié : le_fil)
-- À coller dans Supabase > SQL Editor > New query, puis Run. Idempotent (rejouable).
-- Le projet Supabase héberge plusieurs applis : chacune a son propre schéma.
-- APRÈS exécution : Settings > API > « Exposed schemas » → ajouter `le_fil`.

create schema if not exists le_fil;

-- ---------------------------------------------------------------- tables
create table if not exists le_fil.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists le_fil.lots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references le_fil.projects(id) on delete set null, -- null = « sans projet »
  title      text not null default '',
  body       text not null default '',
  due        date,
  done       boolean not null default false,
  position   integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists le_fil.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lot_id     uuid not null references le_fil.lots(id) on delete cascade,
  label      text not null default '',
  due        date,
  done       boolean not null default false,
  position   integer not null default 0
);

create table if not exists le_fil.user_prefs (
  user_id               uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  selected_projects     uuid[] not null default '{}',
  view                  text not null default 'liste' check (view in ('liste', 'cal', 'gantt')),
  sort                  text not null default 'urgence' check (sort in ('urgence', 'récent', 'manuel')),
  cal_mode              text not null default 'mois' check (cal_mode in ('mois', 'semaine')),
  show_tasks_in_gantt   boolean not null default true,
  show_tasks_in_calendar boolean not null default true
);

create index if not exists lots_user_idx     on le_fil.lots(user_id);
create index if not exists lots_project_idx  on le_fil.lots(project_id);
create index if not exists tasks_lot_idx     on le_fil.tasks(lot_id);
create index if not exists projects_user_idx on le_fil.projects(user_id);

-- updated_at automatique sur les lots
create or replace function le_fil.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists lots_touch on le_fil.lots;
create trigger lots_touch before update on le_fil.lots
  for each row execute function le_fil.touch_updated_at();

-- ------------------------------------------------------------------- RLS
-- Chaque utilisateur ne voit et ne modifie que ses propres lignes.
alter table le_fil.projects   enable row level security;
alter table le_fil.lots       enable row level security;
alter table le_fil.tasks      enable row level security;
alter table le_fil.user_prefs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects', 'lots', 'tasks', 'user_prefs'] loop
    execute format('drop policy if exists own_rows on le_fil.%I', t);
    execute format(
      'create policy own_rows on le_fil.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Un lot ou une tâche ne peut référencer que des lignes du même utilisateur.
create or replace function le_fil.check_same_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Ifs imbriqués : `new.project_id` n'existe que sur lots, `new.lot_id` que sur tasks.
  if tg_table_name = 'lots' then
    if new.project_id is not null then
      if not exists (select 1 from le_fil.projects p where p.id = new.project_id and p.user_id = new.user_id) then
        raise exception 'project_id appartient à un autre utilisateur';
      end if;
    end if;
  elsif tg_table_name = 'tasks' then
    if not exists (select 1 from le_fil.lots l where l.id = new.lot_id and l.user_id = new.user_id) then
      raise exception 'lot_id appartient à un autre utilisateur';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists lots_owner on le_fil.lots;
create trigger lots_owner before insert or update on le_fil.lots
  for each row execute function le_fil.check_same_owner();
drop trigger if exists tasks_owner on le_fil.tasks;
create trigger tasks_owner before insert or update on le_fil.tasks
  for each row execute function le_fil.check_same_owner();

-- ---------------------------------------------------------------- droits
-- Pas d'accès pour `anon` (non connecté) ; `authenticated` passe par la RLS.
grant usage on schema le_fil to authenticated;
grant select, insert, update, delete on all tables in schema le_fil to authenticated;
alter default privileges in schema le_fil
  grant select, insert, update, delete on tables to authenticated;
