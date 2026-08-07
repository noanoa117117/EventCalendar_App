-- Manual UI fixture cleanup. Use the same three emails and date window used by
-- real_google_ui_fixture.sql. This deletes only deterministic fixture IDs.

begin;

create temporary table _manual_cleanup_config (ordinal int primary key, email text not null, start_date date, end_date date) on commit drop;
insert into _manual_cleanup_config values
  (1, 'REPLACE_WITH_GOOGLE_EMAIL_1@example.com', null, null),
  (2, 'REPLACE_WITH_GOOGLE_EMAIL_2@example.com', null, null),
  (3, 'REPLACE_WITH_GOOGLE_EMAIL_3@example.com', null, null);

do $$
declare
  v_start date;
  v_end date;
begin
  if exists (select 1 from _manual_cleanup_config where email like 'REPLACE_WITH_GOOGLE_EMAIL_%') then
    raise exception 'Edit all three fixture email placeholders first';
  end if;
  if (select count(distinct lower(btrim(email))) from _manual_cleanup_config) <> 3 then
    raise exception 'The three cleanup emails must be distinct';
  end if;
  select min(start_date), max(end_date) into v_start, v_end from _manual_cleanup_config;
  if v_start is null or v_end is null
     or exists (select 1 from _manual_cleanup_config where start_date is distinct from v_start or end_date is distinct from v_end)
  then
    raise exception 'Set the same non-empty start_date and end_date used by the fixture';
  end if;
  if v_end < v_start then
    raise exception 'end_date must be on or after start_date';
  end if;
end;
$$;

create temporary table _manual_cleanup_ids on commit drop as
select
  ('00000000-0000-0000-0000-' || substr(md5(format(
    'event-calendar-manual-ui-fixture:v1:%s:%s', c.ordinal, d::date
  )), 1, 12))::uuid as id
from _manual_cleanup_config c
cross join lateral generate_series(c.start_date, c.end_date, interval '1 day') as dates(d);

-- Preliminary report: review this exact ID set before the delete.
select s.id, s.user_id, s.date, s.start_time, s.end_time, s.preset_id
from public.availability_slots s
join _manual_cleanup_ids f using (id)
order by s.date, s.user_id;

delete from public.availability_slots s
using _manual_cleanup_ids f
where s.id = f.id;

commit;
