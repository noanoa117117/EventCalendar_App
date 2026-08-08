import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAvailabilityRanges, weekRange } from "../src/lib/availability.ts";
import { format } from "date-fns";

test("summarizeAvailabilityRanges renders no rows for an empty day", () => {
  assert.deepEqual(summarizeAvailabilityRanges([]), []);
});

test("summarizeAvailabilityRanges joins adjacent and overlapping half-hour ranges", () => {
  assert.deepEqual(summarizeAvailabilityRanges([
    { start_time: "20:30:00", end_time: "21:00:00" },
    { start_time: "20:00:00", end_time: "20:30:00" },
    { start_time: "20:45:00", end_time: "21:30:00" },
  ]), [{ start: "20:00", end: "21:30" }]);
});

test("summarizeAvailabilityRanges keeps separated availability as separate labels", () => {
  assert.deepEqual(summarizeAvailabilityRanges([
    { start_time: "13:00:00", end_time: "18:00:00" },
    { start_time: "20:00:00", end_time: "23:30:00" },
  ]), [
    { start: "13:00", end: "18:00" },
    { start: "20:00", end: "23:30" },
  ]);
});

test("summarizeAvailabilityRanges renders the end-of-day sentinel as 24:00", () => {
  assert.deepEqual(summarizeAvailabilityRanges([
    { start_time: "23:30:00", end_time: "00:00:00" },
  ]), [{ start: "23:30", end: "24:00" }]);
});

test("weekRange starts on Monday to match the event calendar week list", () => {
  const range = weekRange(new Date("2026-08-08T12:00:00Z"));
  assert.equal(format(range.start, "yyyy-MM-dd"), "2026-08-03");
  assert.equal(format(range.end, "yyyy-MM-dd"), "2026-08-09");
});
