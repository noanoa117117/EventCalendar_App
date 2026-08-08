import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/0009_active_members_and_admin_nicknames.sql", import.meta.url), "utf8");
const selfProtectionMigration = readFileSync(new URL("../supabase/migrations/0010_admin_self_access_protection.sql", import.meta.url), "utf8");
const adminPanel = readFileSync(new URL("../src/app/admin/admin-panel.tsx", import.meta.url), "utf8");
const availabilityPage = readFileSync(new URL("../src/app/availability/page.tsx", import.meta.url), "utf8");
const planningPage = readFileSync(new URL("../src/app/planning/page.tsx", import.meta.url), "utf8");
const eventsPage = readFileSync(new URL("../src/app/events/page.tsx", import.meta.url), "utf8");

test("active member RPC permits only enabled allowlisted profiles with configured nicknames", () => {
  assert.match(migration, /create or replace function public\.list_active_profiles\(\)/);
  assert.match(migration, /security definer stable\s+set search_path = public/);
  assert.match(migration, /if not public\.is_allowed_user\(\) then/);
  assert.match(migration, /join auth\.users u on u\.id = p\.id/);
  assert.match(migration, /join public\.allowed_emails a/);
  assert.match(migration, /where a\.is_enabled/);
  assert.match(migration, /btrim\(coalesce\(p\.nickname, ''\)\) <> ''/);
  assert.match(migration, /revoke all on function public\.list_active_profiles\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.list_active_profiles\(\) to authenticated/);
});

test("managed allowlist RPC returns nicknames only through the existing admin gate", () => {
  assert.match(migration, /create function public\.list_managed_allowed_emails\(\)/);
  assert.match(migration, /if not public\.is_admin\(\) then/);
  assert.match(migration, /nullif\(btrim\(p\.nickname\), ''\) as nickname/);
  assert.match(migration, /revoke all on function public\.list_managed_allowed_emails\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.list_managed_allowed_emails\(\) to authenticated/);
});

test("availability and planning consume the shared active-member RPC", () => {
  assert.match(availabilityPage, /supabase\.rpc\("list_active_profiles"\)/);
  assert.match(planningPage, /supabase\.rpc\("list_active_profiles"\)/);
  assert.doesNotMatch(availabilityPage, /from\("profiles"\)\.select\("id, nickname, color"\)\.order\("nickname"\)/);
  assert.doesNotMatch(planningPage, /from\("profiles"\)\.select\("id, nickname, color"\)\.order\("nickname"\)/);
});

test("admin UI distinguishes email and nickname and handles unset names without horizontal truncation", () => {
  assert.match(adminPanel, /ニックネーム/);
  assert.match(adminPanel, /entry\.nickname \?\? "未設定"/);
  assert.match(adminPanel, /break-words/);
  assert.match(adminPanel, /list_managed_allowed_emails/);
});

test("admin self-access protection is enforced in the UI and mutation RPCs", () => {
  assert.match(adminPanel, /actorEmail/);
  assert.match(adminPanel, /normalized === actorEmail/);
  assert.match(adminPanel, /entry\.email\.trim\(\)\.toLowerCase\(\) === actorEmail/);
  assert.match(adminPanel, /操作は成功しましたが、一覧の再取得に失敗しました。表示中の内容を維持しています。/);
  assert.match(selfProtectionMigration, /v_actor_email text := lower\(btrim\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\)\)/);
  assert.match(selfProtectionMigration, /if v_email = v_actor_email then/);
  assert.match(selfProtectionMigration, /cannot manage own allowlist entry/);
  assert.match(selfProtectionMigration, /cannot remove the last enabled super user/);
  assert.match(selfProtectionMigration, /create or replace function public\.delete_allowed_email/);
});

test("offboarding keeps profiles and historic event identity data intact", () => {
  assert.doesNotMatch(migration, /delete\s+from\s+public\.profiles/i);
  assert.doesNotMatch(migration, /delete\s+from\s+auth\.users/i);
  assert.match(eventsPage, /from\("profiles"\)\.select\("id, nickname, color"\)\.in\("id", ids\)/);
});
