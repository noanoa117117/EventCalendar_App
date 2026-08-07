-- Phase 1-2 schema: auth allowlist, profiles, availability presets/slots,
-- and the events/event_participants tables (created now, unused by the UI
-- until Phase 3). See REQUIREMENTS.md section 5.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- allowed_emails: closed-signup allowlist. Managed by direct DB access
-- only (no RLS write policy) - see REQUIREMENTS.md section 4/9.
-- ---------------------------------------------------------------------
create table public.allowed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint allowed_emails_email_normalized check (email = lower(btrim(email)))
);

alter table public.allowed_emails enable row level security;

-- A user may check only their own row (used by the login gate). Listing
-- the whole table, or writing to it, is not permitted from the client.
create policy "allowed_emails_self_select"
  on public.allowed_emails for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------------------------------------------------------------------
-- Shared authorization helper: true only for authenticated users whose
-- Google email is present and enabled in allowed_emails. security definer
-- so it can be used inside every other table's RLS policies regardless of
-- what those policies grant on allowed_emails itself.
-- ---------------------------------------------------------------------
create or replace function public.is_allowed_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_enabled = true
  );
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  color text not null,
  created_at timestamptz not null default now(),
  constraint profiles_nickname_length check (char_length(nickname) between 1 and 20),
  constraint profiles_nickname_trimmed check (nickname = btrim(nickname))
);

create unique index profiles_nickname_lower_idx on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

-- Nicknames are the only identity shown in-app, so every allowed member
-- may read every profile; only the owner may write their own row.
create policy "profiles_select_allowed"
  on public.profiles for select
  to authenticated
  using (is_allowed_user());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and is_allowed_user())
  with check (id = auth.uid() and is_allowed_user());

-- Profile creation is available only through setup_profile, which assigns
-- the profile color and seeds the default presets atomically.
revoke insert on table public.profiles from authenticated;

-- ---------------------------------------------------------------------
-- Shared time-of-day helpers.
-- 30-minute boundary values only. For *_time columns that represent the
-- end of a range, '00:00' is a sentinel meaning "end of day" (24:00),
-- since Postgres `time` cannot hold 24:00 directly. It always means
-- end-of-day - there is no ambiguity, since a value only plays the "end"
-- role in these columns.
-- ---------------------------------------------------------------------
create or replace function public.is_half_hour_boundary(t time)
returns boolean
language sql
immutable
as $$
  select extract(second from t) = 0 and extract(minute from t)::int in (0, 30);
$$;

create or replace function public.end_of_day_minutes(t time)
returns int
language sql
immutable
as $$
  select case when t = '00:00:00'::time then 1440
         else (extract(hour from t)::int * 60 + extract(minute from t)::int)
         end;
$$;

-- ---------------------------------------------------------------------
-- availability_presets
-- ---------------------------------------------------------------------
create table public.availability_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  start_time time not null,
  end_time time not null,
  color text not null,
  sort_order int not null default 0,
  constraint availability_presets_label_length check (char_length(btrim(label)) between 1 and 30),
  constraint availability_presets_boundary check (
    public.is_half_hour_boundary(start_time) and public.is_half_hour_boundary(end_time)
  ),
  -- Same value is only a valid range when end_time = 00:00, which means
  -- "24:00" (whole day), not "zero duration" - see header comment.
  constraint availability_presets_nonzero_range check (
    end_time = '00:00:00'::time or start_time <> end_time
  ),
  constraint availability_presets_ordered check (
    public.end_of_day_minutes(end_time) > (extract(hour from start_time)::int * 60 + extract(minute from start_time)::int)
  )
);

create index availability_presets_user_idx on public.availability_presets (user_id, sort_order);

alter table public.availability_presets enable row level security;

-- Presets are a personal painting tool, not shared calendar data - only
-- the owner can see or edit their own presets.
create policy "availability_presets_owner_all"
  on public.availability_presets for all
  to authenticated
  using (user_id = auth.uid() and is_allowed_user())
  with check (user_id = auth.uid() and is_allowed_user());

-- ---------------------------------------------------------------------
-- availability_slots
-- ---------------------------------------------------------------------
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  preset_id uuid references public.availability_presets (id) on delete set null,
  constraint availability_slots_boundary check (
    public.is_half_hour_boundary(start_time) and public.is_half_hour_boundary(end_time)
  ),
  constraint availability_slots_nonzero_range check (
    end_time = '00:00:00'::time or start_time <> end_time
  ),
  constraint availability_slots_ordered check (
    public.end_of_day_minutes(end_time) > (extract(hour from start_time)::int * 60 + extract(minute from start_time)::int)
  )
);

create index availability_slots_user_date_idx on public.availability_slots (user_id, date);
create index availability_slots_date_idx on public.availability_slots (date);

alter table public.availability_slots enable row level security;

-- The whole point of the app is that everyone can see everyone's
-- availability; only the owner can write to their own rows, and only within
-- the Tokyo date window. Table write privileges are revoked below so client
-- edits must go through public.set_availability.
create policy "availability_slots_select_allowed"
  on public.availability_slots for select
  to authenticated
  using (is_allowed_user());

create policy "availability_slots_write_own_window"
  on public.availability_slots for all
  to authenticated
  using (
    user_id = auth.uid()
    and is_allowed_user()
    and date >= (now() at time zone 'Asia/Tokyo')::date
    and date <= (
      date_trunc('month', now() at time zone 'Asia/Tokyo')
        + interval '4 months' - interval '1 day'
    )::date
  )
  with check (
    user_id = auth.uid()
    and is_allowed_user()
    and date >= (now() at time zone 'Asia/Tokyo')::date
    and date <= (
      date_trunc('month', now() at time zone 'Asia/Tokyo')
        + interval '4 months' - interval '1 day'
    )::date
  );

revoke insert, update, delete on table public.availability_slots from authenticated;

-- ---------------------------------------------------------------------
-- events / event_participants (Phase 3 UI; schema created now)
-- ---------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  status text not null default 'published',
  created_at timestamptz not null default now(),
  constraint events_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint events_time_order check (end_at > start_at),
  constraint events_status_valid check (status in ('published', 'cancelled'))
);

create index events_start_at_idx on public.events (start_at);

alter table public.events enable row level security;

create policy "events_select_allowed"
  on public.events for select
  to authenticated
  using (is_allowed_user());

create policy "events_insert_own"
  on public.events for insert
  to authenticated
  with check (created_by = auth.uid() and is_allowed_user());

create policy "events_update_own"
  on public.events for update
  to authenticated
  using (created_by = auth.uid() and is_allowed_user())
  with check (created_by = auth.uid() and is_allowed_user());

create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null,
  comment text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_participants_status_valid check (status in ('going', 'maybe', 'declined'))
);

alter table public.event_participants enable row level security;

create policy "event_participants_select_allowed"
  on public.event_participants for select
  to authenticated
  using (is_allowed_user());

create policy "event_participants_write_own"
  on public.event_participants for all
  to authenticated
  using (user_id = auth.uid() and is_allowed_user())
  with check (user_id = auth.uid() and is_allowed_user());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger event_participants_set_updated_at
  before update on public.event_participants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- setup_profile: idempotent first-login setup. Creates the profile (with
-- an auto-assigned color) and seeds default availability_presets, in one
-- transaction, exactly once per user. It is the only client-callable path
-- that can create a profile.
-- ---------------------------------------------------------------------
create or replace function public.setup_profile(p_nickname text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := btrim(p_nickname);
  v_color text;
  v_count int;
  v_profile public.profiles;
  v_palette text[] := array[
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'
  ];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_allowed_user() then
    raise exception 'not an allowed user';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if found then
    return v_profile;
  end if;

  if char_length(v_nickname) < 1 or char_length(v_nickname) > 20 then
    raise exception 'invalid nickname length';
  end if;

  if exists (select 1 from public.profiles where lower(nickname) = lower(v_nickname)) then
    raise exception 'nickname already taken' using errcode = '23505';
  end if;

  select count(*) into v_count from public.profiles;
  v_color := v_palette[(v_count % array_length(v_palette, 1)) + 1];

  insert into public.profiles (id, nickname, color)
  values (v_uid, v_nickname, v_color)
  returning * into v_profile;

  insert into public.availability_presets (user_id, label, start_time, end_time, color, sort_order)
  values
    (v_uid, '平日夜', '20:00', '00:00', '#3b82f6', 0),
    (v_uid, '休日昼', '13:00', '18:00', '#22c55e', 1),
    (v_uid, '終日OK', '00:00', '00:00', '#8b5cf6', 2);

  return v_profile;
end;
$$;

revoke execute on function public.setup_profile(text) from public;
grant execute on function public.setup_profile(text) to authenticated;

-- ---------------------------------------------------------------------
-- set_availability: paint or clear a time range across one or more dates
-- for the calling user, merging/splitting existing rows so each
-- (user_id, date) never holds overlapping or touching ranges. Direct table
-- writes are disabled, so this function performs the authorization and
-- date-window checks before changing rows.
-- ---------------------------------------------------------------------
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

  foreach v_date in array p_dates loop
    if v_date < v_min_date or v_date > v_max_date then
      raise exception 'date % is outside the editable window', v_date;
    end if;

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

revoke execute on function public.set_availability(date[], time, time, boolean, uuid) from public;
grant execute on function public.set_availability(date[], time, time, boolean, uuid) to authenticated;
