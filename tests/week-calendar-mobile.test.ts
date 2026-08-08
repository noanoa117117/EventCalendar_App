import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app/availability/_components/week-calendar.tsx", import.meta.url), "utf8");

test("mobile weekly availability uses a seven-day vertical list and keeps the grid desktop-only", () => {
  assert.match(source, /days\.map\(\(day\) => \{/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto overscroll-y-contain @3xl:hidden/);
  assert.match(source, /hidden min-h-0 flex-1 overflow-auto @3xl:block/);
  assert.match(source, /grid min-w-\[44rem\]/);
  assert.match(source, /空き時間未登録/);
  assert.match(source, /summarizeAvailabilityRanges/);
});

test("mobile editor is a one-day bottom sheet with 48 accessible half-hour controls", () => {
  assert.match(source, /<Dialog open=\{mobileDate !== null\}/);
  assert.match(source, /bottom-0 max-h-\[90dvh\]/);
  assert.match(source, /Array\.from\(\{ length: ROWS \}/);
  assert.match(source, /aria-pressed=\{covered\}/);
  assert.match(source, /min-h-11/);
});

test("mobile edit gesture separates scroll, tap, long-press drag, and cancellation", () => {
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?\}, 350\)/);
  assert.match(source, /Math\.abs\(event\.clientY - touch\.startY\) > 8/);
  assert.match(source, /onPointerCancel=\{clearInteraction\}/);
  assert.match(source, /event\.detail === 0/);
});
