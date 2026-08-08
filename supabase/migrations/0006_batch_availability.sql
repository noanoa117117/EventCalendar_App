-- Atomic availability draft batches. Operations never contain a target user;
-- the authenticated user is always the only mutation target.
create or replace function public.set_availability_batch(p_operations jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_op jsonb;
  v_date text;
  v_dates date[];
  v_start time;
  v_end time;
  v_active boolean;
  v_preset uuid;
  v_count int := 0;
  v_date_count int := 0;
  v_distinct_dates int;
  v_min date := (now() at time zone 'Asia/Tokyo')::date;
  v_max date := (date_trunc('month', now() at time zone 'Asia/Tokyo') + interval '4 months' - interval '1 day')::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_allowed_user() then raise exception 'not an allowed user'; end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) = 0 or jsonb_array_length(p_operations) > 100 then
    raise exception 'invalid operations';
  end if;

  -- Validate every operation before taking locks or mutating any row.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ? 'userId' or jsonb_typeof(v_op->'dates') <> 'array' or jsonb_array_length(v_op->'dates') = 0 or jsonb_array_length(v_op->'dates') > 1000
       or not (v_op ? 'start') or not (v_op ? 'end') or jsonb_typeof(v_op->'active') <> 'boolean'
       or not (v_op ? 'presetId') then raise exception 'invalid operation'; end if;
    v_start := (v_op->>'start')::time;
    v_end := (v_op->>'end')::time;
    if not public.is_half_hour_boundary(v_start) or not public.is_half_hour_boundary(v_end)
       or (extract(hour from v_start)::int * 60 + extract(minute from v_start)::int) >= public.end_of_day_minutes(v_end) then
      raise exception 'invalid operation time';
    end if;
    v_active := (v_op->>'active')::boolean;
    if not v_active and (v_op->>'presetId') is not null and (v_op->>'presetId') <> 'null' then raise exception 'remove operations cannot specify a preset'; end if;
    if v_active then
      if v_op->>'presetId' is null or (v_op->>'presetId') = 'null' then
        -- null presets are valid for manual availability operations.
        null;
      else
        v_preset := (v_op->>'presetId')::uuid;
        if not exists (select 1 from public.availability_presets where id = v_preset and user_id = v_uid) then raise exception 'preset not found'; end if;
      end if;
    end if;
    for v_date in select jsonb_array_elements_text(v_op->'dates')
    loop
      if v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid date'; end if;
      if v_date::date < v_min or v_date::date > v_max then raise exception 'date % is outside the editable window', v_date; end if;
      v_date_count := v_date_count + 1;
    end loop;
    v_count := v_count + 1;
  end loop;
  select count(distinct x::date) into v_distinct_dates
  from jsonb_array_elements(p_operations) op, jsonb_array_elements_text(op->'dates') x;
  if v_date_count > 2000 or v_distinct_dates > 500 then raise exception 'too many affected dates'; end if;

  -- Lock all affected keys globally sorted before replaying original order.
  for v_date in
    select distinct x::text from jsonb_array_elements(p_operations) op,
      jsonb_array_elements_text(op->'dates') x order by x::text
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_date, 0));
  end loop;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    v_dates := array(select x::date from jsonb_array_elements_text(v_op->'dates') x);
    v_preset := case when v_op->>'presetId' is null or v_op->>'presetId' = 'null' then null else (v_op->>'presetId')::uuid end;
    perform public.set_availability(v_dates, (v_op->>'start')::time, (v_op->>'end')::time, (v_op->>'active')::boolean, v_preset);
  end loop;
end;
$$;

revoke all on function public.set_availability_batch(jsonb) from public, anon;
grant execute on function public.set_availability_batch(jsonb) to authenticated;

-- Keep the established normalization implementation, but put an ownership
-- gate in front of it for direct callers as well.
alter function public.set_availability(date[], time, time, boolean, uuid)
  rename to set_availability_normalize;
create or replace function public.set_availability(
  p_dates date[], p_start time, p_end time, p_active boolean, p_preset_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_preset_id is not null and not exists (
    select 1 from public.availability_presets where id = p_preset_id and user_id = auth.uid()
  ) then raise exception 'preset not found'; end if;
  perform public.set_availability_normalize(p_dates, p_start, p_end, p_active, p_preset_id);
end;
$$;
revoke all on function public.set_availability(date[], time, time, boolean, uuid) from public, anon;
grant execute on function public.set_availability(date[], time, time, boolean, uuid) to authenticated;
revoke all on function public.set_availability_normalize(date[], time, time, boolean, uuid) from public, anon, authenticated;
