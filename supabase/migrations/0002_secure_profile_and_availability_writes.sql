-- Keep profile creation and availability mutations behind the validating RPCs.
-- The base migration already defines those functions and their authorization
-- checks; this migration only closes the direct PostgREST table paths and
-- normalizes the editable-window policy for databases upgraded from 0001.

drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "availability_slots_write_own_future" on public.availability_slots;
drop policy if exists "availability_slots_write_own_window" on public.availability_slots;
drop policy if exists "availability_slots_write_own_editable_window" on public.availability_slots;

create policy "availability_slots_write_own_editable_window"
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

revoke insert on table public.profiles from public, authenticated;
revoke insert, update, delete on table public.availability_slots from public, authenticated;

-- Preserve the 0001 RPC authorization checks while allowing the functions to
-- perform the writes after direct table privileges are revoked.
alter function public.setup_profile(text) security definer;
alter function public.setup_profile(text) set search_path = public;

alter function public.set_availability(date[], time, time, boolean, uuid) security definer;
alter function public.set_availability(date[], time, time, boolean, uuid) set search_path = public;

revoke all on function public.setup_profile(text) from public;
grant execute on function public.setup_profile(text) to authenticated;

revoke all on function public.set_availability(date[], time, time, boolean, uuid) from public;
grant execute on function public.set_availability(date[], time, time, boolean, uuid) to authenticated;
