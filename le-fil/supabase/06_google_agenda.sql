-- Le Fil — synchro vers Google Agenda (sens unique Le Fil → Google).
-- À coller dans Supabase > SQL Editor > New query (nom suggéré : le_fil_google_agenda). Idempotent.
--
-- Une ligne par utilisateur ayant relié son agenda Google. Le jeton longue durée (refresh token)
-- ne doit jamais être lisible depuis l'appli : RLS activée SANS aucune politique, et aucun droit
-- pour `authenticated` → seule la fonction Edge `gcal` (rôle service_role) y accède.

create table if not exists le_fil.gcal_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  calendar_id   text not null default 'primary',
  last_sync     timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

alter table le_fil.gcal_links enable row level security;

-- Les droits par défaut du schéma (schema.sql) donnent tout à `authenticated` : on les retire ici.
revoke all on le_fil.gcal_links from authenticated, anon;
grant usage on schema le_fil to service_role;
grant select, insert, update, delete on le_fil.gcal_links to service_role;
