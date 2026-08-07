# Local Docker fixture

These scripts create exactly three deterministic dummy email/password users,
their profiles, and nine varied availability slots. They are privileged SQL
fixtures for the local Supabase Docker database; they are not part of the
application seed and must never be run against a hosted/remote project.

Start local Supabase as usual, then confirm the database URL and host port with
`npx supabase status`. With the checked-in `supabase/config.toml`, run the
following localhost command. (The SQL guard intentionally uses an explicit
session marker; PostgreSQL reports its container-internal port as 5432, not
the host-exposed port 54322.)

```sh
PGOPTIONS='-c app.supabase_local_fixture=true' \
  psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -v ON_ERROR_STOP=1 -f supabase/local/fixture.sql
```

`psql` をホストに入れていない場合は、同じ操作を Docker 内の
PostgreSQL クライアントで実行できます。

```sh
docker cp supabase/local/fixture.sql supabase_db_EventCalendar_App:/tmp/eventcalendar-fixture.sql
docker exec -e PGOPTIONS='-c app.supabase_local_fixture=true' \
  supabase_db_EventCalendar_App \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/eventcalendar-fixture.sql
```

Each fixture user can sign in locally with its email and the password
`local-fixture-password`. Re-running `fixture.sql` is safe and replaces only
the fixture's fixed slot IDs. To remove the fixture without touching other
local data, run:

```sh
PGOPTIONS='-c app.supabase_local_fixture=true' \
  psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -v ON_ERROR_STOP=1 -f supabase/local/cleanup.sql
```

Docker 経由では `fixture.sql` を `cleanup.sql` に置き換えて同様に実行します。

For a complete local database reset (which also reruns configured migrations
and seeds), use `npx supabase db reset`; no fixture script is loaded by that
command unless explicitly run afterward.
