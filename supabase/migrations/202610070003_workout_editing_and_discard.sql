-- Run after migrations 202610070001 and 202610070002. Safe to re-run.
-- Enables explicit coach discard of active drafts and corrected comparison dates.
-- Applying this update does not change or delete existing workout records.
begin;

create or replace function public.delete_record(kind text, payload jsonb, expected_revision integer, operation_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  record_id uuid;
  owner_team uuid;
  current_revision integer;
  next_revision integer;
  workout_status text;
begin
  if auth.uid() is null or team is null or public.my_role() is distinct from 'coach' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if kind is null or kind not in ('workout', 'weighin') then raise exception 'invalid_kind'; end if;
  if expected_revision is null or expected_revision < 0 or operation_id is null then raise exception 'invalid_revision'; end if;
  record_id := (payload->>'id')::uuid;
  if record_id is null then raise exception 'invalid_record'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || operation_id::text, 0));
  select r.revision into current_revision from public.mutation_receipts r
  where r.user_id = auth.uid() and r.operation_id = delete_record.operation_id;
  if found then return current_revision; end if;
  -- Match the save RPC's lock, including records created/deleted while offline.
  perform 1 from public.teams t where t.id = team for update;
  select d.team_id, d.revision into owner_team, current_revision from public.deleted_records d
  where d.kind = delete_record.kind and d.id = record_id;
  if found then
    if owner_team <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
    next_revision := current_revision;
  else
    if kind = 'workout' then
      select w.team_id, w.revision, w.data->>'status' into owner_team, current_revision, workout_status
      from public.workouts w where w.id = record_id;
    else
      select w.team_id, w.revision into owner_team, current_revision from public.weighins w where w.id = record_id;
    end if;
    if owner_team is not null and owner_team <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
    if coalesce(current_revision, 0) <> expected_revision then raise exception 'revision_conflict'; end if;
    if kind = 'workout' and workout_status = 'active' and payload->>'discard' is distinct from 'true' then raise exception 'active_workout'; end if;
    if kind = 'workout' and payload->>'discard' = 'true' and workout_status is not null and workout_status <> 'active' then raise exception 'workout_finished'; end if;
    next_revision := coalesce(current_revision, 0) + 1;
    insert into public.deleted_records(kind, id, team_id, revision) values (kind, record_id, team, next_revision);
    if kind = 'workout' then
      delete from public.coach_notes n where n.team_id = team and n.data->>'workoutId' = record_id::text;
      delete from public.workouts w where w.id = record_id and w.team_id = team;
    else
      delete from public.weighins w where w.id = record_id and w.team_id = team;
    end if;
  end if;
  insert into public.mutation_receipts(user_id, operation_id, revision) values (auth.uid(), operation_id, next_revision);
  return next_revision;
end;
$$;
revoke all on function public.delete_record(text, jsonb, integer, uuid) from public, anon;
grant execute on function public.delete_record(text, jsonb, integer, uuid) to authenticated;


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
    'historyDeletion', true, 'workoutDiscard', true,
    'deletedRecords', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'id', d.id, 'revision', d.revision)) from public.deleted_records d where d.team_id = team), '[]'::jsonb));
end;
$$;
revoke all on function public.get_workspace() from public, anon;
grant execute on function public.get_workspace() to authenticated;

notify pgrst, 'reload schema';
commit;
