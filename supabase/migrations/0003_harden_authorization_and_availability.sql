-- Phase 1-2 hardening:
-- * the allowlist is never exposed through the client-facing table API;
-- * availability updates serialize on (user, date), including an initially
--   empty date, so concurrent paints cannot lose an insert.

drop policy if exists "allowed_emails_self_select" on public.allowed_emails;
revoke all on table public.allowed_emails from public, anon, authenticated;

-- This remains a boolean, non-enumerating RPC. Its security-definer owner can
-- inspect the allowlist while callers can learn only whether they are allowed.
create or replace function public.is_allowed_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_enabled = true
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

-- Advisory transaction locks cover the no-existing-row case where FOR UPDATE
-- alone has no row to lock. Dates are processed in sorted order to avoid
-- deadlocks when two requests update overlapping date arrays.
create or replace function public.set_availability(
  p_dates date[],
  p_start time,
  p_end time,
  p_active boolean,
  p_preset_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min_date date := (now() at time zone 'Asia/Tokyo')::date;
  v_max_date date := (
    date_trunc('month', now() at time zone 'Asia/Tokyo')
      + interval '4 months' - interval '1 day'
  )::date;
  v_start_min int;
  v_end_min int;
  v_date date;
  rec record;
  v_new_start int;
  v_new_end int;
  v_merged_count int;
  v_final_preset uuid;
  r_start int;
  r_end int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_allowed_user() then
    raise exception 'not an allowed user';
  end if;
  if not public.is_half_hour_boundary(p_start) or not public.is_half_hour_boundary(p_end) then
    raise exception 'times must be on 30-minute boundaries';
  end if;

  v_start_min := extract(hour from p_start)::int * 60 + extract(minute from p_start)::int;
  v_end_min := public.end_of_day_minutes(p_end);
  if v_start_min >= v_end_min then
    raise exception 'end time must be after start time';
  end if;

  for v_date in
    select distinct d
    from unnest(coalesce(p_dates, '{}'::date[])) as dates(d)
    order by d
  loop
    if v_date < v_min_date or v_date > v_max_date then
      raise exception 'date % is outside the editable window', v_date;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(v_uid::text || ':' || v_date::text, 0)
    );

    if p_active then
      v_new_start := v_start_min;
      v_new_end := v_end_min;
      v_merged_count := 0;

      for rec in
        select id, start_time, end_time
        from public.availability_slots
        where user_id = v_uid and date = v_date
        for update
      loop
        r_start := extract(hour from rec.start_time)::int * 60 + extract(minute from rec.start_time)::int;
        r_end := public.end_of_day_minutes(rec.end_time);

        if r_start <= v_new_end and r_end >= v_new_start then
          v_new_start := least(v_new_start, r_start);
          v_new_end := greatest(v_new_end, r_end);
          v_merged_count := v_merged_count + 1;
          delete from public.availability_slots where id = rec.id;
        end if;
      end loop;

      v_final_preset := case when v_merged_count = 0 then p_preset_id else null end;

      insert into public.availability_slots (user_id, date, start_time, end_time, preset_id)
      values (
        v_uid,
        v_date,
        make_time(0, 0, 0) + (v_new_start || ' minutes')::interval,
        case when v_new_end = 1440 then '00:00:00'::time
             else make_time(0, 0, 0) + (v_new_end || ' minutes')::interval end,
        v_final_preset
      );
    else
      for rec in
        select id, start_time, end_time, preset_id
        from public.availability_slots
        where user_id = v_uid and date = v_date
        for update
      loop
        r_start := extract(hour from rec.start_time)::int * 60 + extract(minute from rec.start_time)::int;
        r_end := public.end_of_day_minutes(rec.end_time);

        if r_end <= v_start_min or r_start >= v_end_min then
          continue;
        end if;

        delete from public.availability_slots where id = rec.id;

        if r_start < v_start_min then
          insert into public.availability_slots (user_id, date, start_time, end_time, preset_id)
          values (
            v_uid, v_date,
            make_time(0, 0, 0) + (r_start || ' minutes')::interval,
            make_time(0, 0, 0) + (v_start_min || ' minutes')::interval,
            rec.preset_id
          );
        end if;

        if r_end > v_end_min then
          insert into public.availability_slots (user_id, date, start_time, end_time, preset_id)
          values (
            v_uid, v_date,
            make_time(0, 0, 0) + (v_end_min || ' minutes')::interval,
            case when r_end = 1440 then '00:00:00'::time
                 else make_time(0, 0, 0) + (r_end || ' minutes')::interval end,
            rec.preset_id
          );
        end if;
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.set_availability(date[], time, time, boolean, uuid) from public;
grant execute on function public.set_availability(date[], time, time, boolean, uuid) to authenticated;
