-- Local/dev convenience seed: whitelist the project owner so the first
-- Google login succeeds without a manual DB edit. Add more members with:
--   insert into public.allowed_emails (email) values ('friend@example.com');
insert into public.allowed_emails (email, is_enabled, role)
values ('sinigamiyuuna@gmail.com', true, 'super_user')
on conflict (email) do update set is_enabled = true, role = 'super_user';
