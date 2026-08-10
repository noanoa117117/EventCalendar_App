import assert from "node:assert/strict";
import test from "node:test";
import { computeDaySummaries } from "../src/lib/availability.ts";

const date = "2026-08-10";
const members = [{ id: "a" }, { id: "b" }, { id: "c" }];
const slot = (user_id: string, start_time = "09:00", end_time = "11:00") => ({ id: `${user_id}-${start_time}`, user_id, date, start_time, end_time, preset_id: null });

test("全員にスロットがあり重なると fullMatch", () => {
  const summary = computeDaySummaries([date], members, new Set(["a", "b", "c"]), [slot("a"), slot("b", "10:00", "12:00"), slot("c", "10:30", "11:30")]).get(date)!;
  assert.equal(summary.fullMatch, true);
  assert.equal(summary.softMatch, false);
  assert.deepEqual(summary.commonRanges, [{ start_time: "10:30", end_time: "11:00" }]);
});

test("2人に重なりがあり1人未登録だと softMatch", () => {
  const summary = computeDaySummaries([date], members, ["a", "b", "c"], [slot("a"), slot("b")]).get(date)!;
  assert.equal(summary.fullMatch, false);
  assert.equal(summary.softMatch, true);
  assert.deepEqual(summary.unregisteredIds, ["c"]);
});

test("全員にスロットがあっても重ならなければ一致しない", () => {
  const summary = computeDaySummaries([date], members, ["a", "b", "c"], [slot("a", "09:00", "10:00"), slot("b", "10:00", "11:00"), slot("c", "11:00", "12:00")]).get(date)!;
  assert.equal(summary.fullMatch, false);
  assert.equal(summary.softMatch, false);
  assert.deepEqual(summary.commonRanges, []);
});

test("誰もスロットがなければ未登録として扱う", () => {
  const summary = computeDaySummaries([date], members, ["a", "b", "c"], []).get(date)!;
  assert.deepEqual(summary.registeredIds, []);
  assert.deepEqual(summary.unregisteredIds, ["a", "b", "c"]);
  assert.equal(summary.fullMatch, false);
});

test("1人だけのスロットは softMatch にしない", () => {
  const summary = computeDaySummaries([date], members, ["a", "b", "c"], [slot("a")]).get(date)!;
  assert.equal(summary.softMatch, false);
});

test("表示対象が1人だけなら全員OKとして強調しない", () => {
  const summary = computeDaySummaries([date], members, ["a"], [slot("a")]).get(date)!;
  assert.equal(summary.fullMatch, false);
});

test("複数スロットの union を取ってから30分単位で intersection する", () => {
  const summary = computeDaySummaries([date], members.slice(0, 2), ["a", "b"], [slot("a", "09:00", "10:00"), slot("a", "10:00", "12:00"), slot("b", "09:30", "11:30")]).get(date)!;
  assert.deepEqual(summary.commonRanges, [{ start_time: "09:30", end_time: "11:30" }]);
});
