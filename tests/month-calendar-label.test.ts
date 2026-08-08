import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatTimeLabel } from "../src/lib/availability.ts";

const source = readFileSync(new URL("../src/app/availability/_components/month-calendar.tsx", import.meta.url), "utf8");

test("month availability labels use explicit start/end lines and a full-day label", () => {
  assert.match(source, /const isAllDay = startTime === "00:00" && endTime === "24:00"/);
  assert.match(source, /<span>〜\{endTime\}<\/span>/);
  assert.match(source, /<span className="whitespace-nowrap">終日<\/span>/);
  assert.doesNotMatch(source, /max-w-full truncate rounded border px-1 text-xs leading-4/);
});

test("month label times preserve full ranges and recognize the all-day boundary", () => {
  assert.equal(`${formatTimeLabel("20:00")}\n〜${formatTimeLabel("00:00", true)}`, "20:00\n〜24:00");
  assert.equal(`${formatTimeLabel("13:00")}\n〜${formatTimeLabel("18:00", true)}`, "13:00\n〜18:00");
  assert.equal(formatTimeLabel("00:00"), "00:00");
  assert.equal(formatTimeLabel("00:00", true), "24:00");
});
