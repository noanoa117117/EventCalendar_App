-- Phase 6: role-aware allowlist administration.
alter table public.allowed_emails
  add column if not exists role text not null default 'member';

alter table public.allowed_emails
  drop constraint if exists allowed_emails_role_valid;
alter table public.allowed_emails
  add constraint allowed_emails_role_valid check (role in ('member', 'admin', 'super_user'));

insert into public.allowed_emails (email, is_enabled, role)
values ('sinigamiyuuna@gmail.com', true, 'super_user')
on conflict (email) do update
set is_enabled = true, role = 'super_user';

create or replace function public.current_user_role()
returns text
language sql security definer stable
set search_path = public
as $$
  select role from public.allowed_emails
  where auth.uid() is not null
    and email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    and is_enabled = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$ select coalesce(public.current_user_role() in ('admin', 'super_user'), false); $$;

create or replace function public.is_super_user()
returns boolean
language sql security definer stable
set search_path = public
as $$ select public.current_user_role() = 'super_user'; $$;

create or replace function public.list_managed_allowed_emails()
returns table (id uuid, email text, is_enabled boolean, role text, created_at timestamptz)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  return query
    select a.id, a.email, a.is_enabled, a.role, a.created_at
    from public.allowed_emails a
    where public.is_super_user() or a.role = 'member'
    order by a.email;
end;
$$;

create or replace function public.set_member_access(p_email text, p_enabled boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;
  perform pg_advisory_xact_lock(hashtextextended('allowed_emails_admin', 0));
  if exists (select 1 from public.allowed_emails where email = v_email and role <> 'member') then
    raise exception 'only member access can be managed';
  end if;
  insert into public.allowed_emails (email, is_enabled, role) values (v_email, p_enabled, 'member')
  on conflict (email) do update set is_enabled = excluded.is_enabled;
end;
$$;

create or replace function public.delete_member(p_email text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;
  perform pg_advisory_xact_lock(hashtextextended('allowed_emails_admin', 0));
  delete from public.allowed_emails where email = v_email and role = 'member';
end;
$$;

create or replace function public.set_allowed_email_role(p_email text, p_role text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := lower(btrim(coalesce(p_role, '')));
begin
  if not public.is_super_user() then raise exception 'not authorized'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid email'; end if;
  if v_role not in ('member', 'admin', 'super_user') then raise exception 'invalid role'; end if;
  perform pg_advisory_xact_lock(hashtextextended('allowed_emails_admin', 0));
  if v_role <> 'super_user'
     and exists (select 1 from public.allowed_emails where email = v_email and role = 'super_user' and is_enabled)
     and (select count(*) from public.allowed_emails where role = 'super_user' and is_enabled) <= 1 then
    raise exception 'cannot remove the last enabled super user';
  end if;
  update public.allowed_emails set role = v_role where email = v_email;
  if not found then raise exception 'email not found'; end if;
end;
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_super_user() from public, anon;
revoke all on function public.list_managed_allowed_emails() from public, anon;
revoke all on function public.set_member_access(text, boolean) from public, anon;
revoke all on function public.delete_member(text) from public, anon;
revoke all on function public.set_allowed_email_role(text, text) from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_user() to authenticated;
grant execute on function public.list_managed_allowed_emails() to authenticated;
grant execute on function public.set_member_access(text, boolean) to authenticated;
grant execute on function public.delete_member(text) to authenticated;
grant execute on function public.set_allowed_email_role(text, text) to authenticated;
