import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatTimeLabel } from "../src/lib/availability.ts";

const source = readFileSync(new URL("../src/app/availability/_components/month-calendar.tsx", import.meta.url), "utf8");

test("month availability uses member dots and overlap labels", () => {
  assert.match(source, /全員OK/);
  assert.match(source, /未登録/);
  assert.match(source, /registeredIds/);
  assert.doesNotMatch(source, /prioritizedSlots/);
});

test("month label times preserve full ranges and recognize the all-day boundary", () => {
  assert.equal(`${formatTimeLabel("20:00")}\n〜${formatTimeLabel("00:00", true)}`, "20:00\n〜24:00");
  assert.equal(`${formatTimeLabel("13:00")}\n〜${formatTimeLabel("18:00", true)}`, "13:00\n〜18:00");
  assert.equal(formatTimeLabel("00:00"), "00:00");
  assert.equal(formatTimeLabel("00:00", true), "24:00");
});
