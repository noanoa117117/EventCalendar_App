-- Local Docker fixture cleanup only. Requires the same explicit local guard as
-- fixture.sql. It deletes only the three fixed fixture users and slot IDs.

begin;

do $$
begin
  if current_setting('app.supabase_local_fixture', true) is distinct from 'true' then
    raise exception
      'Refusing local fixture cleanup: set app.supabase_local_fixture=true only for the local Supabase database';
  end if;
end;
$$;

delete from auth.users
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);

delete from public.allowed_emails
where email in ('fixture-alice@example.test', 'fixture-bob@example.test', 'fixture-cara@example.test');

commit;
