import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const pageSource = readFileSync(new URL("../src/app/planning/page.tsx", import.meta.url), "utf8");

test("planning query validates dates, half-hour starts, and member IDs", () => {
  assert.match(pageSource, /parsePlanningQuery/);
  assert.match(pageSource, /\(\?:00\|30\)/);
  assert.match(pageSource, /allowedIds\.has/);
});

test("planning query rejects malformed values", () => {
  assert.match(pageSource, /isValid\(parsedDate\)/);
  assert.match(pageSource, /memberIds: memberIds\.length \? /);
});

test("full overlap week cells navigate to planning without auto-creating", () => {
  const source = readFileSync(new URL("../src/app/availability/_components/week-calendar.tsx", import.meta.url), "utf8");
  assert.match(source, /role=\{canOpenPlanning \? "button"/);
  assert.match(source, /router\.push\(`\/planning\?/);
  assert.match(source, /members: visibleMembers\.map/);
  assert.doesNotMatch(source, /createEvent/);
});

test("planning board restores the navigation query on client-side transitions", () => {
  const source = readFileSync(new URL("../src/app/planning/_components/planning-board.tsx", import.meta.url), "utf8");
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("members"\)/);
  assert.match(source, /safeRouteStart/);
});
