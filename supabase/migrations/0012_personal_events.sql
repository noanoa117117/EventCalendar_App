-- Private, owner-only events. Personal events never participate in shared
-- attendance, cancellation notifications, or Google Calendar sync.
alter table public.events
  add column is_personal boolean not null default false;

alter table public.events
  add constraint personal_events_google_sync_is_null check (
    not is_personal or (
      google_sync_status is null and google_sync_error is null and google_synced_at is null
    )
  );

drop policy if exists "events_select_allowed" on public.events;
create policy "events_select_allowed"
  on public.events for select to authenticated
  using (public.is_allowed_user() and (not is_personal or created_by = auth.uid()));

create policy "events_delete_own_personal"
  on public.events for delete to authenticated
  using (public.is_allowed_user() and is_personal and created_by = auth.uid());

drop policy if exists "event_participants_select_allowed" on public.event_participants;
drop policy if exists "event_participants_write_own" on public.event_participants;

create policy "event_participants_select_shared"
  on public.event_participants for select to authenticated
  using (
    public.is_allowed_user()
    and exists (
      select 1 from public.events e
      where e.id = event_id and not e.is_personal
    )
  );

create policy "event_participants_write_own_shared"
  on public.event_participants for all to authenticated
  using (
    user_id = auth.uid() and public.is_allowed_user()
    and exists (
      select 1 from public.events e
      where e.id = event_id and not e.is_personal
    )
  )
  with check (
    user_id = auth.uid() and public.is_allowed_user()
    and exists (
      select 1 from public.events e
      where e.id = event_id and not e.is_personal
    )
  );

create or replace function public.protect_event_kind_and_personal_participants()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'events' then
    if old.is_personal is distinct from new.is_personal then
      raise exception 'event kind cannot be changed';
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.events e
    where e.id = case when tg_op = 'DELETE' then old.event_id else new.event_id end
      and e.is_personal
  ) then
    raise exception 'personal events cannot have participants';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_event_kind
  before update on public.events for each row
  execute function public.protect_event_kind_and_personal_participants();

create trigger prevent_personal_event_participants
  before insert or update or delete on public.event_participants for each row
  execute function public.protect_event_kind_and_personal_participants();

create or replace function public.cancel_event(p_event_id uuid, p_actor_id uuid)
returns public.events
language plpgsql security definer set search_path = public
as $$
declare v_event public.events%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  if p_actor_id is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from auth.users u join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_actor_id and a.is_enabled
  ) then raise exception 'not an allowed user'; end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'event not found'; end if;
  if v_event.is_personal then raise exception 'personal events cannot be cancelled'; end if;
  if v_event.created_by <> p_actor_id then raise exception 'only the organizer can cancel this event'; end if;
  if v_event.status <> 'published' then raise exception 'only published events can be cancelled'; end if;

  perform set_config('app.cancel_event_rpc', 'on', true);
  update public.events set status = 'cancelled' where id = p_event_id;
  insert into public.event_notifications (event_id, user_id, event_title, event_start_at, event_end_at, organizer_id)
  select p.event_id, p.user_id, v_event.title, v_event.start_at, v_event.end_at, v_event.created_by
  from public.event_participants p
  where p.event_id = p_event_id and p.status = 'going' and p.user_id <> p_actor_id
  on conflict (event_id, user_id, notification_type) do nothing;
  select * into v_event from public.events where id = p_event_id;
  return v_event;
end;
$$;
