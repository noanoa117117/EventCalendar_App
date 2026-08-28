import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/0012_personal_events.sql", "utf8");
const calendar = readFileSync("src/app/events/event-calendar.tsx", "utf8");
const syncRoute = readFileSync("src/app/api/events/sync/route.ts", "utf8");

test("personal events are owner-only and cannot change kind", () => {
  assert.match(migration, /add column is_personal boolean not null default false/);
  assert.match(migration, /not is_personal or created_by = auth\.uid\(\)/);
  assert.match(migration, /event kind cannot be changed/);
  assert.match(migration, /drop policy if exists "event_participants_select_allowed"/);
  assert.match(migration, /event_participants_select_shared/);
  assert.match(migration, /event_participants_write_own_shared/);
  assert.match(migration, /where e\.id = event_id and not e\.is_personal/);
});

test("personal events cannot have shared-event side effects", () => {
  assert.match(migration, /personal events cannot have participants/);
  assert.match(migration, /personal events cannot be cancelled/);
  assert.match(migration, /personal_events_google_sync_is_null/);
  assert.match(syncRoute, /Personal events cannot be synced/);
  assert.match(calendar, /if \(!selected \|\| selected\.is_personal\) return/);
  assert.match(calendar, /if \(!result\.data\.is_personal\) triggerSync/);
});

test("calendar exposes both filters and the exact creation choices", () => {
  assert.match(calendar, /useState\(true\)[\s\S]*useState\(true\)/);
  assert.match(calendar, /予定を作る前にメンバーの空き時間を確認しますか？/);
  assert.match(calendar, /空き時間を確認する/);
  assert.match(calendar, /共有イベントを確認せずに作成/);
  assert.match(calendar, /個人イベントを作成/);
});

test("mobile month cells split shared and personal event counts", () => {
  assert.match(calendar, /const sharedCount = dayEvents\.filter\(\(event\) => !event\.is_personal\)\.length/);
  assert.match(calendar, /const personalCount = dayEvents\.filter\(\(event\) => event\.is_personal\)\.length/);
  assert.match(calendar, /共有イベント\$\{sharedCount\}件/);
  assert.match(calendar, /個人イベント\$\{personalCount\}件/);
  assert.match(calendar, /bg-event-soft[\s\S]*bg-personal-soft/);
});

test("event form heading identifies shared or personal event kind", () => {
  assert.match(calendar, /isPersonal \? "個人" : "共有"/);
  assert.match(calendar, /イベントを\{event \? "編集" : "作成"\}/);
});
