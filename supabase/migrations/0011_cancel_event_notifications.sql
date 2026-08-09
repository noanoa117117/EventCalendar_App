-- Cancellation outbox and the single authorized cancellation path.
create table public.event_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null default 'cancellation',
  event_title text not null,
  event_start_at timestamptz not null,
  event_end_at timestamptz not null,
  organizer_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id, notification_type)
);

alter table public.event_notifications enable row level security;
revoke all on table public.event_notifications from public, anon, authenticated;

create or replace function public.prevent_direct_event_status_change()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and coalesce(current_setting('app.cancel_event_rpc', true), '') <> 'on' then
    raise exception 'event status can only be changed by cancel_event';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_event_status_change on public.events;
create trigger prevent_direct_event_status_change
  before update on public.events
  for each row execute function public.prevent_direct_event_status_change();

create or replace function public.prevent_cancelled_event_participant_write()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare v_event_status text;
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.delete_cancelled_event', true), '') = 'on' then
    return old;
  end if;
  if tg_op = 'DELETE' then
    select status into v_event_status from public.events where id = old.event_id;
  else
    select status into v_event_status from public.events where id = new.event_id;
  end if;
  if v_event_status = 'cancelled' then
    raise exception 'participants cannot be changed for a cancelled event';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists prevent_cancelled_event_participant_write on public.event_participants;
create trigger prevent_cancelled_event_participant_write
  before insert or update or delete on public.event_participants
  for each row execute function public.prevent_cancelled_event_participant_write();

create or replace function public.cancel_event(p_event_id uuid, p_actor_id uuid)
returns public.events
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'not authorized'; end if;
  if p_actor_id is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1
    from auth.users u
    join public.allowed_emails a on a.email = lower(u.email)
    where u.id = p_actor_id and a.is_enabled
  ) then raise exception 'not an allowed user'; end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'event not found'; end if;
  if v_event.created_by <> p_actor_id then raise exception 'only the organizer can cancel this event'; end if;
  if v_event.status <> 'published' then raise exception 'only published events can be cancelled'; end if;

  perform set_config('app.cancel_event_rpc', 'on', true);
  update public.events set status = 'cancelled' where id = p_event_id;

  insert into public.event_notifications (
    event_id, user_id, event_title, event_start_at, event_end_at, organizer_id
  )
  select p.event_id, p.user_id, v_event.title, v_event.start_at, v_event.end_at, v_event.created_by
  from public.event_participants p
  where p.event_id = p_event_id and p.status = 'going' and p.user_id <> p_actor_id
  on conflict (event_id, user_id, notification_type) do nothing;

  select * into v_event from public.events where id = p_event_id;
  return v_event;
end;
$$;

revoke all on function public.cancel_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_event(uuid, uuid) to service_role;

-- Keep the existing super-user break-glass RPC, while allowing its cascading
-- participant deletes through the cancelled-event write guard.
create or replace function public.delete_cancelled_event(p_event_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
  if not public.is_super_user() then raise exception 'not authorized'; end if;
  select status into v_status from public.events where id = p_event_id;
  if v_status is null then raise exception 'event not found'; end if;
  if v_status <> 'cancelled' then raise exception 'only cancelled events can be deleted'; end if;
  perform set_config('app.delete_cancelled_event', 'on', true);
  delete from public.events where id = p_event_id;
end;
$$;

revoke all on function public.delete_cancelled_event(uuid) from public, anon;
grant execute on function public.delete_cancelled_event(uuid) to authenticated;
