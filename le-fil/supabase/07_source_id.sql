-- Le Fil — identifiant de source externe (import des séances de l'app « organisation-cours »).
-- À coller dans Supabase > SQL Editor > New query (nom suggéré : le_fil_source_id), puis Run.
-- Sans risque pour l'existant : colonnes nullables, aucune donnée modifiée.

alter table le_fil.projects add column if not exists source_id text;
alter table le_fil.lots     add column if not exists source_id text;
alter table le_fil.tasks    add column if not exists source_id text;

create unique index if not exists projects_source_uq on le_fil.projects(user_id, source_id) where source_id is not null;
create unique index if not exists lots_source_uq     on le_fil.lots(user_id, source_id)     where source_id is not null;
create unique index if not exists tasks_source_uq    on le_fil.tasks(user_id, source_id)    where source_id is not null;
