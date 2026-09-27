-- Le Fil — migration 3 : corrige le trigger check_same_owner (erreur « record "new" has no field "project_id" » sur tasks).
-- À coller dans SQL Editor (nom suggéré : le_fil_fix_check_same_owner), puis Run.
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
