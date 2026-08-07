-- Phase 7: secure, role-aware allowlist administration.
-- The older mutation entry points are removed so all writes use the same
-- actor/target checks and last-super-user invariant.
drop function if exists public.set_member_access(text, boolean);
drop function if exists public.delete_member(text);
drop function if exists public.set_allowed_email_role(text, text);

create or replace function public.manage_allowed_email(
  p_email text,
  p_role text default 'member',
  p_enabled boolean default true
)
returns public.allowed_emails
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_actor_role text;
  v_existing public.allowed_emails;
  v_result public.allowed_emails;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email';
  end if;
  if v_role not in ('member', 'admin', 'super_user') then
    raise exception 'invalid role';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('allowed_emails_admin', 0));
  select * into v_existing from public.allowed_emails where email = v_email for update;
  v_actor_role := public.current_user_role();
  if v_actor_role not in ('admin', 'super_user') then raise exception 'not authorized'; end if;
  if v_actor_role = 'admin' and v_existing.id is not null and v_existing.role <> 'member' then
    raise exception 'only member access can be managed';
  end if;
  if v_actor_role = 'admin' and v_role <> 'member' then
    raise exception 'only member role can be assigned';
  end if;

  if v_existing.id is not null
     and v_existing.role = 'super_user'
     and v_existing.is_enabled
     and (v_role <> 'super_user' or not p_enabled)
     and (select count(*) from public.allowed_emails where role = 'super_user' and is_enabled) <= 1 then
    raise exception 'cannot remove the last enabled super user';
  end if;

  insert into public.allowed_emails (email, role, is_enabled)
  values (v_email, v_role, p_enabled)
  on conflict (email) do update
    set role = excluded.role, is_enabled = excluded.is_enabled
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.delete_allowed_email(p_email text)
returns public.allowed_emails
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_actor_role text;
  v_existing public.allowed_emails;
  v_result public.allowed_emails;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('allowed_emails_admin', 0));
  select * into v_existing from public.allowed_emails where email = v_email for update;
  if v_existing.id is null then raise exception 'email not found'; end if;
  v_actor_role := public.current_user_role();
  if v_actor_role not in ('admin', 'super_user') then raise exception 'not authorized'; end if;
  if v_actor_role = 'admin' and v_existing.role <> 'member' then
    raise exception 'only member access can be managed';
  end if;
  if v_existing.role = 'super_user' and v_existing.is_enabled
     and (select count(*) from public.allowed_emails where role = 'super_user' and is_enabled) <= 1 then
    raise exception 'cannot remove the last enabled super user';
  end if;
  delete from public.allowed_emails where id = v_existing.id returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.manage_allowed_email(text, text, boolean) from public, anon;
revoke all on function public.delete_allowed_email(text) from public, anon;
grant execute on function public.manage_allowed_email(text, text, boolean) to authenticated;
grant execute on function public.delete_allowed_email(text) to authenticated;
