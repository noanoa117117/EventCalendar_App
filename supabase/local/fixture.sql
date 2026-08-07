-- Local Docker fixture only. This file must never be run against a hosted
-- Supabase project. Run it with PGOPTIONS='-c app.supabase_local_fixture=true'
-- and the local database URL shown in `supabase status`. The SQL server sees
-- Docker's internal port (5432), so the host port (54322) is checked by the
-- documented localhost connection command rather than from inside SQL.

begin;

do $$
begin
  if current_setting('app.supabase_local_fixture', true) is distinct from 'true' then
    raise exception
      'Refusing local fixture: set app.supabase_local_fixture=true only for the local Supabase database';
  end if;
end;
$$;

-- These IDs and emails belong only to this fixture. Re-running this file
-- updates the same three users and replaces only their deterministic slots.
create temporary table _local_fixture_users (
  id uuid primary key,
  email text not null unique,
  nickname text not null,
  color text not null
) on commit drop;

insert into _local_fixture_users (id, email, nickname, color)
values
  ('10000000-0000-0000-0000-000000000001', 'fixture-alice@example.test', 'Fixture Alice', '#ef4444'),
  ('10000000-0000-0000-0000-000000000002', 'fixture-bob@example.test', 'Fixture Bob', '#3b82f6'),
  ('10000000-0000-0000-0000-000000000003', 'fixture-cara@example.test', 'Fixture Cara', '#22c55e');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, crypt('local-fixture-password', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('fixture', true, 'nickname', nickname), now(), now()
from _local_fixture_users
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into public.allowed_emails (email, is_enabled, role)
select email, true, 'member' from _local_fixture_users
on conflict (email) do update set is_enabled = true, role = 'member';

insert into public.profiles (id, nickname, color)
select id, nickname, color from _local_fixture_users
on conflict (id) do update set nickname = excluded.nickname, color = excluded.color;

create temporary table _local_fixture_slots (id uuid primary key, user_id uuid not null, date date not null, start_time time not null, end_time time not null) on commit drop;
insert into _local_fixture_slots (id, user_id, date, start_time, end_time)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-10', '09:00', '17:00'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-10', '18:00', '22:00'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '2026-08-10', '00:00', '00:00'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '2026-08-11', '13:00', '18:30'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '2026-08-11', '08:30', '12:00'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', '2026-08-11', '19:00', '00:00'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '2026-08-12', '10:00', '12:00'),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '2026-08-12', '14:00', '16:30'),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', '2026-08-12', '07:00', '09:30');

delete from public.availability_slots
where id in (select id from _local_fixture_slots);
insert into public.availability_slots (id, user_id, date, start_time, end_time)
select id, user_id, date, start_time, end_time from _local_fixture_slots;

select u.email, p.nickname, count(s.id) as slot_count
from _local_fixture_users u
join public.profiles p on p.id = u.id
left join public.availability_slots s on s.user_id = u.id
group by u.email, p.nickname
order by u.email;

commit;
