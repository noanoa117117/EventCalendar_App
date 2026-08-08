-- Expose only enabled, configured members to availability and planning.
-- The explicit auth.users join avoids relying on profile-table RLS for identity
-- to allowlist matching while keeping the function safe for authenticated callers.
create or replace function public.list_active_profiles()
returns table (id uuid, nickname text, color text)
language plpgsql
security definer stable
set search_path = public
as $$
begin
  if not public.is_allowed_user() then
    raise exception 'not authorized';
  end if;

  return query
    select p.id, p.nickname, p.color
    from public.profiles p
    join auth.users u on u.id = p.id
    join public.allowed_emails a
      on a.email = lower(btrim(coalesce(u.email, '')))
    where a.is_enabled
      and btrim(coalesce(p.nickname, '')) <> ''
    order by p.nickname;
end;
$$;

revoke all on function public.list_active_profiles() from public, anon;
grant execute on function public.list_active_profiles() to authenticated;

-- Include a readable nickname in the admin list without exposing auth emails
-- or weakening the existing admin/super-user role gate.
drop function if exists public.list_managed_allowed_emails();
create function public.list_managed_allowed_emails()
returns table (id uuid, email text, nickname text, is_enabled boolean, role text, created_at timestamptz)
language plpgsql
security definer stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select a.id,
           a.email,
           nullif(btrim(p.nickname), '') as nickname,
           a.is_enabled,
           a.role,
           a.created_at
    from public.allowed_emails a
    left join auth.users u
      on lower(btrim(coalesce(u.email, ''))) = a.email
    left join public.profiles p on p.id = u.id
    where public.is_super_user() or a.role = 'member'
    order by a.email;
end;
$$;

revoke all on function public.list_managed_allowed_emails() from public, anon;
grant execute on function public.list_managed_allowed_emails() to authenticated;
