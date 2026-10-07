-- After applying the migration, create three users in Authentication > Users.
-- The three user IDs below were supplied by the coach. Run in SQL Editor once.
-- Passwords and API keys are NOT needed in this script.
do $$
declare
  team uuid;
  coach uuid := 'e4ea1ff5-833e-4efc-b582-3a163214f7d4';
  anna uuid := '55190837-1ec1-414b-a377-a92b1761da96';
  dimitra uuid := '8bb496d5-6d34-47d6-a517-d497182b9bde';
begin
  if coach = anna or coach = dimitra or anna = dimitra then raise exception 'Choose three distinct users'; end if;
  if exists (select 1 from public.profiles where id in (coach, anna, dimitra)) then raise exception 'These users already have profiles; existing membership was preserved'; end if;
  insert into public.teams(name) values ('Workout Lab') returning id into team;
  insert into public.profiles(id, team_id, role, athlete_id) values
    (coach, team, 'coach', null), (anna, team, 'athlete', 'anna'), (dimitra, team, 'athlete', 'dimitra');
end;
$$;
