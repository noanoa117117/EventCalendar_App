import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app/availability/_components/preset-panel.tsx", import.meta.url), "utf8");
const mobileRail = source.slice(source.indexOf("/* Mobile: horizontal scrollable pill bar */"), source.indexOf("/* Desktop: toggle list */"));

test("the normal mobile preset rail has separate selection and edit controls", () => {
  assert.match(mobileRail, /role="option"/);
  assert.match(mobileRail, /aria-label=\{`\$\{p\.label\}を編集`\}/);
  assert.match(mobileRail, /event\.stopPropagation\(\);\s*openEdit\(p\);/);
  assert.match(mobileRail, /min-h-11/);
  assert.match(mobileRail, /h-11 w-11/);
});

test("the normal mobile preset rail keeps ownership and editing guards", () => {
  assert.match(mobileRail, /disabled=\{!canEdit \|\| p\.user_id !== userId\}/);
  assert.match(mobileRail, /disabled=\{!canActivate\}/);
  assert.match(mobileRail, /aria-label="パターンを追加"/);
});
