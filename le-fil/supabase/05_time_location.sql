-- Le Fil — horaire (début/fin) et lieu, pour lots et tâches (chantier rdv/agenda).
-- À coller dans Supabase > SQL Editor > New query (nom suggéré : le_fil_time_location).

alter table le_fil.lots  add column if not exists start_time time;
alter table le_fil.lots  add column if not exists end_time   time;
alter table le_fil.lots  add column if not exists location   text not null default '';

alter table le_fil.tasks add column if not exists start_time time;
alter table le_fil.tasks add column if not exists end_time   time;
alter table le_fil.tasks add column if not exists location   text not null default '';
