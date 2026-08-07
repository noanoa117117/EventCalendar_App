-- Local/dev convenience seed: whitelist the project owner so the first
-- Google login succeeds without a manual DB edit. Add more members with:
--   insert into public.allowed_emails (email) values ('friend@example.com');
insert into public.allowed_emails (email)
values ('sinigamiyuuna@gmail.com')
on conflict (email) do nothing;
