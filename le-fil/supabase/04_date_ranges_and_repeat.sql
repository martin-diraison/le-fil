-- Le Fil — fourchettes de dates (début optionnel) + récurrence des lots (anniversaires…).
-- À coller dans Supabase > SQL Editor > New query (nom suggéré : le_fil_date_ranges_repeat).

alter table le_fil.lots  add column if not exists start_date date;
alter table le_fil.tasks add column if not exists start_date date;

alter table le_fil.lots add column if not exists repeat text not null default 'none';
alter table le_fil.lots drop constraint if exists lots_repeat_check;
alter table le_fil.lots add constraint lots_repeat_check
  check (repeat in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
