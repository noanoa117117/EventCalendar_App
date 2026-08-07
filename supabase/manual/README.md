# Manual real-user UI fixture

These SQL Editor scripts create and remove a small UI fixture for three real
Google-authenticated users. They deliberately bypass `public.set_availability`
so the rows retain simple, predictable ranges for UI testing; this is **not**
the normal `supabase/seed.sql` flow.

Before running either script, edit the three email placeholders and the
`start_date` / `end_date` placeholders. Dates are plain JST calendar dates
(inclusive). The three users must have logged in once so that Supabase has
created both `auth.users` and their `public.profiles` rows. Each account must
also be enabled in `public.allowed_emails` and have a non-empty nickname.

Run `real_google_ui_fixture.sql` first in the Supabase SQL Editor. It aborts
before inserting if the three accounts cannot be resolved exactly, if the date
window is empty/invalid, or if any target user/date cell contains a non-fixture
slot. Run `cleanup_real_google_ui_fixture.sql` separately when finished; it
reports the exact deterministic fixture rows before deleting them.

Neither script inserts or updates `auth.users` or `public.profiles`, and the
cleanup does not delete by broad user or date criteria.
