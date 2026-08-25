import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/events/event-calendar.tsx", import.meta.url),
  "utf8",
);

test("event month and week ranges start on Sunday and end on Saturday", () => {
  assert.equal(source.match(/weekStartsOn: 0/g)?.length, 4);
  assert.doesNotMatch(source, /weekStartsOn: 1/);
  assert.match(
    source,
    /startOfWeek\(startOfMonth\(cursor\), \{ weekStartsOn: 0 \}\)/,
  );
  assert.match(
    source,
    /endOfWeek\(endOfMonth\(cursor\), \{ weekStartsOn: 0 \}\)/,
  );
  assert.match(source, /startOfWeek\(cursor, \{ weekStartsOn: 0 \}\)/);
  assert.match(source, /endOfWeek\(cursor, \{ weekStartsOn: 0 \}\)/);
});

test("event calendar weekday header is ordered Sunday through Saturday", () => {
  assert.match(
    source,
    /\["日", "月", "火", "水", "木", "金", "土"\]\.map/,
  );
});

test("Sunday-first layout keeps JST-shaped event date matching", () => {
  assert.match(
    source,
    /isSameDay\(asJstCalendarDate\(event\.start_at\), day\)/,
  );
});
