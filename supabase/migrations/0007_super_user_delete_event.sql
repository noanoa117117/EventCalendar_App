-- Super user can physically delete cancelled events.
-- Uses security-definer so RLS DELETE policy is not needed on the events table.

create or replace function public.delete_cancelled_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_super_user() then
    raise exception 'not authorized';
  end if;

  select status into v_status from public.events where id = p_event_id;
  if v_status is null then
    raise exception 'event not found';
  end if;
  if v_status <> 'cancelled' then
    raise exception 'only cancelled events can be deleted';
  end if;

  delete from public.events where id = p_event_id;
end;
$$;

revoke all on function public.delete_cancelled_event(uuid) from public, anon;
grant execute on function public.delete_cancelled_event(uuid) to authenticated;
