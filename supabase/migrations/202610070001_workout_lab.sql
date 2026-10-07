-- Apply in the Supabase SQL editor. No passwords or service-role keys here.
begin;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Workout Lab',
  current_program uuid,
  program_revision integer not null default 0
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  role text not null check (role in ('coach', 'athlete')),
  athlete_id text check (athlete_id in ('anna', 'dimitra')),
  check ((role = 'coach' and athlete_id is null) or (role = 'athlete' and athlete_id is not null)),
  unique (team_id, athlete_id)
);
create table public.program_versions (
  team_id uuid not null references public.teams(id),
  id uuid not null,
  data jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now(),
  primary key (team_id, id)
);
create table public.workouts (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.weighins (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  athlete_id text not null check (athlete_id in ('anna', 'dimitra')),
  measured_on date not null,
  weight numeric not null check (weight > 0 and weight < 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.goals (
  team_id uuid not null references public.teams(id),
  athlete_id text not null check (athlete_id in ('anna', 'dimitra')),
  weight numeric check (weight is null or (weight > 0 and weight < 1000)),
  revision integer not null default 1,
  primary key (team_id, athlete_id)
);
create table public.coach_notes (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  data jsonb not null,
  revision integer not null default 1
);
create table public.mutation_receipts (
  user_id uuid not null references auth.users(id),
  operation_id uuid not null,
  revision integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index on public.workouts(team_id);
create index on public.weighins(team_id, athlete_id, measured_on);
create index on public.coach_notes(team_id);

create function public.my_team() returns uuid language sql stable security definer set search_path = '' as $$
  select p.team_id from public.profiles p where p.id = auth.uid();
$$;
create function public.my_role() returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;
create function public.my_athlete() returns text language sql stable security definer set search_path = '' as $$
  select p.athlete_id from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_team(), public.my_role(), public.my_athlete() from public, anon;
grant execute on function public.my_team(), public.my_role(), public.my_athlete() to authenticated;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.program_versions enable row level security;
alter table public.workouts enable row level security;
alter table public.weighins enable row level security;
alter table public.goals enable row level security;
alter table public.coach_notes enable row level security;
alter table public.mutation_receipts enable row level security;

create policy own_profile on public.profiles for select to authenticated using (id = auth.uid());
create policy own_team on public.teams for select to authenticated using (id = public.my_team());
create policy team_program on public.program_versions for select to authenticated using (team_id = public.my_team());
create policy coach_workouts on public.workouts for select to authenticated using (team_id = public.my_team() and public.my_role() = 'coach');
create policy team_weighins on public.weighins for select to authenticated using (team_id = public.my_team());
create policy team_goals on public.goals for select to authenticated using (team_id = public.my_team());
create policy private_notes on public.coach_notes for select to authenticated using (team_id = public.my_team() and public.my_role() = 'coach');
-- There are deliberately no direct-write policies; revision-aware RPCs handle writes.
revoke all on public.teams, public.profiles, public.program_versions, public.workouts, public.weighins, public.goals, public.coach_notes, public.mutation_receipts from anon;
revoke insert, update, delete, truncate, references, trigger on public.teams, public.profiles, public.program_versions, public.workouts, public.weighins, public.goals, public.coach_notes, public.mutation_receipts from authenticated;
grant select on public.teams, public.profiles, public.program_versions, public.workouts, public.weighins, public.goals, public.coach_notes to authenticated;

create function public.save_record(kind text, payload jsonb, expected_revision integer, operation_id uuid)
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
  if auth.uid() is null or team is null then raise exception 'not_authorized' using errcode = '42501'; end if;
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

create function public.get_workspace() returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'date', w.data->>'completedAt', 'name', w.data->'routine'->>'name', 'results',
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
  return jsonb_build_object('program', program, 'workouts', workout_data, 'comparisons', comparisons, 'weighIns', measurements, 'goals', goal_data, 'notes', notes);
end;
$$;
revoke all on function public.get_workspace() from public, anon;
grant execute on function public.get_workspace() to authenticated;

commit;
