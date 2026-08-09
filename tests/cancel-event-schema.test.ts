import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/0011_cancel_event_notifications.sql", "utf8");
const route = fs.readFileSync("src/app/api/events/cancel/route.ts", "utf8");

test("cancel_event snapshots only going participants and excludes the organizer", () => {
  assert.match(migration, /p\.status = 'going' and p\.user_id <> p_actor_id/);
  assert.match(migration, /unique \(event_id, user_id, notification_type\)/);
});

test("only the server-side service role can execute cancellation RPC", () => {
  assert.match(migration, /if auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /grant execute on function public\.cancel_event\(uuid, uuid\) to service_role/);
  assert.match(route, /admin\.rpc\("cancel_event", \{ p_event_id: eventId, p_actor_id: user\.id \}\)/);
});

test("cancelled events reject participant changes and direct status changes", () => {
  assert.match(migration, /event status can only be changed by cancel_event/);
  assert.match(migration, /participants cannot be changed for a cancelled event/);
});
