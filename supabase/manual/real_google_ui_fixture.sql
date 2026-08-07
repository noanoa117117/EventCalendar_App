-- Manual UI fixture only. Run in the Supabase SQL Editor with a privileged
-- database role. This bypasses set_availability/RPC normalization on purpose.
-- Edit all email/date values below before running. Dates are inclusive JST dates.

begin;

create temporary table _manual_fixture_config (
  ordinal int primary key,
  email text not null,
  start_date date,
  end_date date
) on commit drop;

insert into _manual_fixture_config (ordinal, email, start_date, end_date)
values
  (1, 'REPLACE_WITH_GOOGLE_EMAIL_1@example.com', null, null), -- e.g. '2026-09-01'
  (2, 'REPLACE_WITH_GOOGLE_EMAIL_2@example.com', null, null), -- e.g. '2026-09-07'
  (3, 'REPLACE_WITH_GOOGLE_EMAIL_3@example.com', null, null);

create temporary table _manual_fixture_users (
  ordinal int primary key,
  email text not null,
  user_id uuid not null unique,
  nickname text not null
) on commit drop;

do $$
declare
  v_start date;
  v_end date;
  v_valid_users int;
  v_distinct_user_ids int;
begin
  if exists (
    select 1 from _manual_fixture_config
    where email like 'REPLACE_WITH_GOOGLE_EMAIL_%'
       or email is null or btrim(email) = ''
  ) then
    raise exception 'Edit all three real Google email placeholders first';
  end if;
  if (select count(distinct lower(btrim(email))) from _manual_fixture_config) <> 3 then
    raise exception 'The three fixture emails must be distinct';
  end if;

  select min(start_date), max(end_date)
    into v_start, v_end
    from _manual_fixture_config;
  -- All three rows intentionally carry the same window; null keeps the
  -- template safe until the operator supplies an explicit JST window.
  if v_start is null or v_end is null or v_start <> v_end
     and exists (select 1 from _manual_fixture_config where start_date <> v_start or end_date <> v_end)
  then
    raise exception 'Set the same non-empty start_date and end_date on all three config rows';
  end if;
  if v_end < v_start then
    raise exception 'end_date must be on or after start_date';
  end if;

  insert into _manual_fixture_users (ordinal, email, user_id, nickname)
  select c.ordinal, lower(btrim(c.email)), u.id, p.nickname
  from _manual_fixture_config c
  join auth.users u on lower(u.email) = lower(btrim(c.email))
  join public.profiles p on p.id = u.id
  join public.allowed_emails a on a.email = lower(btrim(c.email)) and a.is_enabled
  where coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
     or coalesce(u.raw_user_meta_data ->> 'provider', '') = 'google'
     or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';

  select count(*), count(distinct user_id)
    into v_valid_users, v_distinct_user_ids
    from _manual_fixture_users;
  if v_valid_users <> 3 or v_distinct_user_ids <> 3 then
    raise exception 'Expected exactly three distinct enabled Google users with profiles and nicknames; resolved % rows', v_valid_users;
  end if;
  if exists (select 1 from _manual_fixture_users where nickname is null or btrim(nickname) = '') then
    raise exception 'Every fixture user must have a non-empty nickname';
  end if;
end;
$$;

create temporary table _manual_fixture_rows on commit drop as
select
  ('00000000-0000-0000-0000-' || substr(md5(format(
    'event-calendar-manual-ui-fixture:v1:%s:%s', u.ordinal, d::date
  )), 1, 12))::uuid as id,
  u.user_id,
  d::date as date,
  case u.ordinal when 1 then '09:00'::time when 2 then '17:30'::time else '00:00'::time end as start_time,
  case u.ordinal when 1 then '17:00'::time when 2 then '22:00'::time else '00:00'::time end as end_time
from _manual_fixture_users u
cross join lateral (
  select generate_series(
    (select min(start_date) from _manual_fixture_config),
    (select max(end_date) from _manual_fixture_config),
    interval '1 day'
  ) as d
) dates;

do $$
declare
  v_conflict_count int;
  v_mismatch_count int;
begin
  select count(*) into v_conflict_count
  from public.availability_slots s
  where exists (select 1 from _manual_fixture_users u where u.user_id = s.user_id)
    and exists (select 1 from _manual_fixture_config c where s.date between c.start_date and c.end_date)
    and not exists (select 1 from _manual_fixture_rows f where f.id = s.id);
  if v_conflict_count > 0 then
    raise exception 'Aborted: % target user/date cells contain non-fixture availability slots', v_conflict_count;
  end if;

  select count(*) into v_mismatch_count
  from public.availability_slots s
  join _manual_fixture_rows f on f.id = s.id
  where (s.user_id, s.date, s.start_time, s.end_time, s.preset_id)
        is distinct from (f.user_id, f.date, f.start_time, f.end_time, null::uuid);
  if v_mismatch_count > 0 then
    raise exception 'Aborted: an existing deterministic fixture ID has unexpected data';
  end if;
end;
$$;

insert into public.availability_slots (id, user_id, date, start_time, end_time, preset_id)
select id, user_id, date, start_time, end_time, null
from _manual_fixture_rows
on conflict (id) do nothing;

select f.*, u.nickname
from _manual_fixture_rows f
join _manual_fixture_users u using (user_id)
order by f.date, u.ordinal;

commit;
