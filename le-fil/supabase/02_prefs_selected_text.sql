-- Le Fil — migration 2 : la sélection du menu peut contenir « __no_project__ » (pas un uuid).
-- À coller dans SQL Editor (nom suggéré : le_fil_prefs_selected_text), puis Run.
alter table le_fil.user_prefs alter column selected_projects drop default;
alter table le_fil.user_prefs alter column selected_projects type text[] using selected_projects::text[];
alter table le_fil.user_prefs alter column selected_projects set default '{}';
