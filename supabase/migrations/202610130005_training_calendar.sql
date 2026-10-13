-- Run after migrations 001-004. Safe to re-run; existing logs are preserved.
begin;

create table if not exists public.training_sessions (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  data jsonb not null,
  workout_id uuid unique references public.workouts(id) on delete set null,
  result_removed boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create index if not exists training_sessions_team on public.training_sessions(team_id);
alter table public.training_sessions enable row level security;
drop policy if exists team_calendar on public.training_sessions;
create policy team_calendar on public.training_sessions for select to authenticated using (team_id = public.my_team());
revoke all on public.training_sessions from public, anon, authenticated;
grant select on public.training_sessions to authenticated;

-- Retain the preceding RPC implementations as private helpers. Creating copies
-- also adjusts PL/pgSQL's function-qualified parameter references.
do $migration$
declare source text;
begin
  if pg_catalog.to_regprocedure('public.save_record_before_calendar(text,jsonb,integer,uuid)') is null then
    source := pg_catalog.pg_get_functiondef('public.save_record(text,jsonb,integer,uuid)'::regprocedure);
    source := replace(source, 'public.save_record(', 'public.save_record_before_calendar(');
    source := replace(source, 'save_record.', 'save_record_before_calendar.');
    execute source;
  end if;
  if pg_catalog.to_regprocedure('public.delete_record_before_calendar(text,jsonb,integer,uuid)') is null then
    source := pg_catalog.pg_get_functiondef('public.delete_record(text,jsonb,integer,uuid)'::regprocedure);
    source := replace(source, 'public.delete_record(', 'public.delete_record_before_calendar(');
    source := replace(source, 'delete_record.', 'delete_record_before_calendar.');
    execute source;
  end if;
  if pg_catalog.to_regprocedure('public.get_workspace_before_calendar()') is null then
    source := pg_catalog.pg_get_functiondef('public.get_workspace()'::regprocedure);
    execute replace(source, 'public.get_workspace(', 'public.get_workspace_before_calendar(');
  end if;
end;
$migration$;
revoke all on function public.save_record_before_calendar(text,jsonb,integer,uuid), public.delete_record_before_calendar(text,jsonb,integer,uuid), public.get_workspace_before_calendar() from public, anon, authenticated;

create or replace function public.save_record(kind text, payload jsonb, expected_revision integer, operation_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  record_id uuid;
  receipt integer;
  current_revision integer;
  next_revision integer;
  owner_team uuid;
  existing_data jsonb;
  session_row public.training_sessions%rowtype;
  session_id uuid;
  routine_name text;
  normalized jsonb;
begin
  if auth.uid() is null or team is null then raise exception 'not_authorized' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or operation_id is null then raise exception 'invalid_revision'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || operation_id::text, 0));
  select r.revision into receipt from public.mutation_receipts r where r.user_id = auth.uid() and r.operation_id = save_record.operation_id;
  if found then return receipt; end if;
  perform 1 from public.teams t where t.id = team for update;

  if kind = 'calendar' then
    if public.my_role() is distinct from 'coach' then raise exception 'not_authorized' using errcode = '42501'; end if;
    record_id := (payload->>'id')::uuid;
    if record_id is null then raise exception 'invalid_calendar'; end if;
    select s.* into session_row from public.training_sessions s where s.id = record_id;
    if found and session_row.team_id <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
    if coalesce(session_row.revision, 0) <> expected_revision then raise exception 'revision_conflict'; end if;
    if session_row.workout_id is not null then raise exception 'calendar_locked'; end if;
    if payload->>'date' is null or payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_calendar_date'; end if;
    -- Casting rejects impossible dates. Preserve the date-only value in Athens.
    perform (payload->>'date')::date;
    if payload->>'startTime' is not null and payload->>'startTime' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'invalid_calendar_time'; end if;
    if payload->>'status' is null or payload->>'status' not in ('planned', 'cancelled') then raise exception 'invalid_calendar_status'; end if;
    if jsonb_typeof(payload->'participants') is distinct from 'array' then raise exception 'invalid_participants'; end if;
    if jsonb_array_length(payload->'participants') not between 1 and 2 or
      exists (select 1 from jsonb_array_elements_text(payload->'participants') a where a not in ('anna', 'dimitra')) or
      (select count(distinct a) from jsonb_array_elements_text(payload->'participants') a) <> jsonb_array_length(payload->'participants') then raise exception 'invalid_participants'; end if;
    select r->>'name' into routine_name from public.teams t
      join public.program_versions p on p.team_id = t.id and p.id = t.current_program,
      jsonb_array_elements(p.data->'routines') r
      where t.id = team and r->>'id' = payload->>'routineId';
    if routine_name is null then raise exception 'invalid_routine'; end if;
    next_revision := coalesce(session_row.revision, 0) + 1;
    normalized := jsonb_build_object('id', record_id, 'date', payload->>'date', 'startTime', payload->>'startTime',
      'routineId', payload->>'routineId', 'routineName', routine_name, 'participants', payload->'participants',
      'status', payload->>'status', 'createdAt', coalesce(session_row.data->>'createdAt', now()::text));
    insert into public.training_sessions(id, team_id, data, revision) values (record_id, team, normalized, next_revision)
      on conflict (id) do update set data = excluded.data, revision = excluded.revision, updated_at = now();
    insert into public.mutation_receipts(user_id, operation_id, revision) values (auth.uid(), operation_id, next_revision);
    return next_revision;
  end if;

  if kind = 'workout' then
    if public.my_role() is distinct from 'coach' then raise exception 'not_authorized' using errcode = '42501'; end if;
    record_id := (payload->>'id')::uuid;
    select w.team_id, w.data, w.revision into owner_team, existing_data, current_revision from public.workouts w where w.id = record_id;
    if owner_team is not null and owner_team <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
    if existing_data is not null and (existing_data->>'scheduleId') is distinct from (payload->>'scheduleId') then raise exception 'calendar_link_changed'; end if;
    if existing_data is null and payload->>'status' = 'active' and exists
      (select 1 from public.workouts w where w.team_id = team and w.id <> record_id and w.data->>'status' = 'active') then raise exception 'active_workout_exists'; end if;
    if payload->>'scheduleId' is not null then
      session_id := (payload->>'scheduleId')::uuid;
      select s.* into session_row from public.training_sessions s where s.id = session_id;
      if not found or session_row.team_id <> team then raise exception 'not_authorized' using errcode = '42501'; end if;
      if session_row.data->>'status' <> 'planned' or
        (session_row.workout_id is not null and session_row.workout_id <> record_id) then raise exception 'calendar_conflict'; end if;
      if session_row.workout_id is null and (payload->>'scheduleRevision')::integer is distinct from session_row.revision then raise exception 'calendar_conflict'; end if;
      if payload->'routine'->>'id' is distinct from session_row.data->>'routineId' then raise exception 'invalid_routine'; end if;
    end if;
  end if;

  next_revision := public.save_record_before_calendar(kind, payload, expected_revision, operation_id);
  if session_id is not null and session_row.workout_id is null then
    update public.training_sessions set workout_id = record_id, result_removed = false, revision = revision + 1, updated_at = now() where id = session_id;
  end if;
  return next_revision;
end;
$$;
revoke all on function public.save_record(text,jsonb,integer,uuid) from public, anon;
grant execute on function public.save_record(text,jsonb,integer,uuid) to authenticated;

create or replace function public.delete_record(kind text, payload jsonb, expected_revision integer, operation_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  receipt integer;
  result integer;
  linked uuid[];
begin
  if auth.uid() is null or team is null or public.my_role() is distinct from 'coach' then raise exception 'not_authorized' using errcode = '42501'; end if;
  if operation_id is null then raise exception 'invalid_revision'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || operation_id::text, 0));
  select r.revision into receipt from public.mutation_receipts r where r.user_id = auth.uid() and r.operation_id = delete_record.operation_id;
  if found then return receipt; end if;
  perform 1 from public.teams t where t.id = team for update;
  if kind = 'workout' then
    select array_agg(s.id) into linked from public.training_sessions s where s.team_id = team and s.workout_id = (payload->>'id')::uuid;
  end if;
  result := public.delete_record_before_calendar(kind, payload, expected_revision, operation_id);
  update public.training_sessions set workout_id = null, result_removed = payload->>'discard' is distinct from 'true', revision = revision + 1, updated_at = now()
    where id = any(linked);
  return result;
end;
$$;
revoke all on function public.delete_record(text,jsonb,integer,uuid) from public, anon;
grant execute on function public.delete_record(text,jsonb,integer,uuid) to authenticated;

create or replace function public.get_workspace() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  team uuid := public.my_team();
  result jsonb;
  sessions jsonb;
  summaries jsonb;
begin
  result := public.get_workspace_before_calendar();
  select coalesce(jsonb_agg(s.data || jsonb_build_object('revision', s.revision, 'workoutId', s.workout_id, 'resultRemoved', s.result_removed)), '[]'::jsonb)
    into sessions from public.training_sessions s where s.team_id = team;
  -- Public team metadata only: no live sets, private notes or account details.
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'scheduleId', w.data->>'scheduleId',
    'date', coalesce(w.data->>'date', ((coalesce(w.data->>'completedAt', w.data->>'startedAt'))::timestamptz at time zone 'Europe/Athens')::date::text),
    'name', w.data->'routine'->>'name', 'routineId', w.data->'routine'->>'id',
    'status', w.data->>'status', 'participants', w.data->'participants')), '[]'::jsonb)
    into summaries from public.workouts w where w.team_id = team;
  return result || jsonb_build_object('calendarEnabled', true, 'calendarSessions', sessions, 'calendarWorkouts', summaries);
end;
$$;
revoke all on function public.get_workspace() from public, anon;
grant execute on function public.get_workspace() to authenticated;
notify pgrst, 'reload schema';
commit;
