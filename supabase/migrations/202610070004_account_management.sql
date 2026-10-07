-- Run after migrations 001, 002, and 003. Safe to re-run.
-- Adds read-only spectators and preserves history when an auth account is deleted.
-- Account admin operations run only inside the authenticated manage-users Edge Function.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('coach', 'athlete', 'spectator'));
alter table public.profiles drop constraint if exists profiles_check;
alter table public.profiles add constraint profiles_check check (
  (role in ('coach', 'spectator') and athlete_id is null) or
  (role = 'athlete' and athlete_id is not null)
);
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check check (length(display_name) <= 80);
update public.profiles set display_name = case when role = 'coach' then 'Προπονητής' when athlete_id = 'anna' then 'Άννα' when athlete_id = 'dimitra' then 'Δήμητρα' else 'Θεατής' end
where display_name = '';

-- Profile membership is removed by its existing ON DELETE CASCADE FK.
-- Historical weigh-ins remain even if their creator's login is removed.
alter table public.weighins alter column created_by drop not null;
alter table public.weighins drop constraint if exists weighins_created_by_fkey;
alter table public.weighins add constraint weighins_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
-- Retry receipts belong to the removed login; they are not workout history.
alter table public.mutation_receipts drop constraint if exists mutation_receipts_user_id_fkey;
alter table public.mutation_receipts add constraint mutation_receipts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

-- Only the server's built-in service role creates/removes membership.
-- Browser clients still cannot directly insert/update/delete profiles.
grant select, insert, delete on public.profiles to service_role;

create or replace function public.save_record(kind text, payload jsonb, expected_revision integer, operation_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  role_name text := public.my_role();
  record_id uuid;
  current_revision integer;
  next_revision integer;
  owner_team uuid;
  athlete text;
begin
  if auth.uid() is null or team is null or role_name not in ('coach', 'athlete') then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- Serialize this account's retries. Receipts make response-loss retries idempotent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || operation_id::text, 0));
  select r.revision into current_revision from public.mutation_receipts r where r.user_id = auth.uid() and r.operation_id = save_record.operation_id;
  if found then return current_revision; end if;
  if expected_revision is null or expected_revision < 0 or operation_id is null then raise exception 'invalid_revision'; end if;
  if kind is null or kind not in ('program', 'workout', 'weighin', 'goal', 'note') then raise exception 'invalid_kind'; end if;
  if kind <> 'weighin' and role_name <> 'coach' then raise exception 'not_authorized' using errcode = '42501'; end if;
  -- The group lock covers new records as well as existing ones, avoiding an insert race.
  perform 1 from public.teams t where t.id = team for update;

  if kind = 'program' then
    select t.program_revision into current_revision from public.teams t where t.id = team;
    if current_revision <> expected_revision then raise exception 'revision_conflict'; end if;
    if jsonb_typeof(payload->'routines') is distinct from 'array' or jsonb_array_length(payload->'routines') = 0 then raise exception 'invalid_program'; end if;
    record_id := (payload->>'id')::uuid;
    next_revision := current_revision + 1;
    -- Versions are immutable; a change uses a new client-generated UUID.
    insert into public.program_versions(team_id, id, data, revision) values (team, record_id, jsonb_set(payload, '{revision}', to_jsonb(next_revision)), next_revision);
    update public.teams set current_program = record_id, program_revision = next_revision where id = team;
  elsif kind = 'goal' then
    athlete := payload->>'id';
    if athlete not in ('anna', 'dimitra') then raise exception 'invalid_athlete'; end if;
    select g.revision into current_revision from public.goals g where g.team_id = team and g.athlete_id = athlete;
    if coalesce(current_revision, 0) <> expected_revision then raise exception 'revision_conflict'; end if;
    next_revision := coalesce(current_revision, 0) + 1;
    insert into public.goals(team_id, athlete_id, weight, revision) values (team, athlete, (payload->>'value')::numeric, next_revision)
    on conflict (team_id, athlete_id) do update set weight = excluded.weight, revision = excluded.revision;
  else
    record_id := (payload->>'id')::uuid;
    if kind = 'workout' then
      select w.team_id, w.revision into owner_team, current_revision from public.workouts w where w.id = record_id;
    elsif kind = 'note' then
      select n.team_id, n.revision into owner_team, current_revision from public.coach_notes n where n.id = record_id;
    else
      select w.team_id, w.revision into owner_team, current_revision from public.weighins w where w.id = record_id;
      athlete := payload->>'athlete';
      if athlete not in ('anna', 'dimitra') then raise exception 'invalid_athlete'; end if;
      if role_name <> 'coach' and (athlete is distinct from public.my_athlete() or current_revision is not null) then raise exception 'not_authorized' using errcode = '42501'; end if;
    end if;
    if owner_team is not null and owner_team <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
    if coalesce(current_revision, 0) <> expected_revision then raise exception 'revision_conflict'; end if;
    next_revision := coalesce(current_revision, 0) + 1;
    if kind = 'workout' then
      if payload->>'status' not in ('active', 'completed', 'partial') or jsonb_typeof(payload->'results') <> 'object' then raise exception 'invalid_workout'; end if;
      insert into public.workouts(id, team_id, data, revision) values (record_id, team, jsonb_set(payload, '{revision}', to_jsonb(next_revision)), next_revision)
      on conflict (id) do update set data = excluded.data, revision = excluded.revision, updated_at = now();
    elsif kind = 'note' then
      if payload->>'athlete' not in ('anna', 'dimitra') or length(payload->>'text') > 10000 then raise exception 'invalid_note'; end if;
      insert into public.coach_notes(id, team_id, data, revision) values (record_id, team, jsonb_set(payload, '{revision}', to_jsonb(next_revision)), next_revision)
      on conflict (id) do update set data = excluded.data, revision = excluded.revision;
    else
      if (payload->>'date')::date > (now() at time zone 'Europe/Athens')::date then raise exception 'future_measurement'; end if;
      insert into public.weighins(id, team_id, athlete_id, measured_on, weight, created_by, revision)
      values (record_id, team, athlete, (payload->>'date')::date, (payload->>'weight')::numeric, auth.uid(), next_revision)
      on conflict (id) do update set athlete_id = excluded.athlete_id, measured_on = excluded.measured_on, weight = excluded.weight, revision = excluded.revision;
    end if;
  end if;
  insert into public.mutation_receipts(user_id, operation_id, revision) values (auth.uid(), operation_id, next_revision);
  return next_revision;
end;
$$;
revoke all on function public.save_record(text, jsonb, integer, uuid) from public, anon;
grant execute on function public.save_record(text, jsonb, integer, uuid) to authenticated;

create or replace function public.get_workspace() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  role_name text := public.my_role();
  mine text := public.my_athlete();
  program jsonb;
  workout_data jsonb;
  comparisons jsonb;
  measurements jsonb;
  goal_data jsonb;
  notes jsonb;
begin
  if auth.uid() is null or team is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  select p.data into program from public.program_versions p join public.teams t on t.id = p.team_id and t.current_program = p.id where t.id = team;
  if role_name = 'coach' then
    select coalesce(jsonb_agg(w.data), '[]'::jsonb) into workout_data from public.workouts w where w.team_id = team;
    select coalesce(jsonb_agg(n.data), '[]'::jsonb) into notes from public.coach_notes n where n.team_id = team;
  elsif role_name = 'spectator' then
    select coalesce(jsonb_agg(w.data), '[]'::jsonb) into workout_data from public.workouts w
    where w.team_id = team and w.data->>'status' <> 'active';
    notes := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_set(jsonb_set(w.data, '{results}',
      coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(w.data->'results') e where e.value->>'athlete' = mine), '{}'::jsonb)), '{participants}', jsonb_build_array(mine))), '[]'::jsonb)
    into workout_data from public.workouts w where w.team_id = team and w.data->>'status' <> 'active' and w.data->'participants' ? mine;
    notes := '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'date', coalesce(w.data->>'date', w.data->>'completedAt', w.data->>'startedAt'), 'name', w.data->'routine'->>'name', 'results',
    jsonb_build_object('anna', jsonb_build_object(
      'completed', (select count(*) from jsonb_each(w.data->'results') e where e.value->>'athlete' = 'anna' and e.value->>'status' = 'completed'),
      'skipped', (select count(*) from jsonb_each(w.data->'results') e where e.value->>'athlete' = 'anna' and e.value->>'status' = 'skipped')),
    'dimitra', jsonb_build_object(
      'completed', (select count(*) from jsonb_each(w.data->'results') e where e.value->>'athlete' = 'dimitra' and e.value->>'status' = 'completed'),
      'skipped', (select count(*) from jsonb_each(w.data->'results') e where e.value->>'athlete' = 'dimitra' and e.value->>'status' = 'skipped'))))), '[]'::jsonb)
  into comparisons from public.workouts w where w.team_id = team and w.data->>'status' <> 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'athlete', w.athlete_id, 'date', w.measured_on, 'weight', w.weight, 'revision', w.revision, 'createdAt', w.created_at)), '[]'::jsonb)
  into measurements from public.weighins w where w.team_id = team;
  select jsonb_build_object(
    'anna', jsonb_build_object('id', 'anna', 'value', (select g.weight from public.goals g where g.team_id = team and g.athlete_id = 'anna'), 'revision', coalesce((select g.revision from public.goals g where g.team_id = team and g.athlete_id = 'anna'), 0)),
    'dimitra', jsonb_build_object('id', 'dimitra', 'value', (select g.weight from public.goals g where g.team_id = team and g.athlete_id = 'dimitra'), 'revision', coalesce((select g.revision from public.goals g where g.team_id = team and g.athlete_id = 'dimitra'), 0))) into goal_data;
  return jsonb_build_object('program', program, 'workouts', workout_data, 'comparisons', comparisons, 'weighIns', measurements, 'goals', goal_data, 'notes', notes,
    'historyDeletion', true, 'workoutDiscard', true, 'accountManagement', true,
    'deletedRecords', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'id', d.id, 'revision', d.revision)) from public.deleted_records d where d.team_id = team), '[]'::jsonb));
end;
$$;
revoke all on function public.get_workspace() from public, anon;
grant execute on function public.get_workspace() to authenticated;

notify pgrst, 'reload schema';
commit;
