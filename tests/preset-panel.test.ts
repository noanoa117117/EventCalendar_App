import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app/availability/_components/preset-panel.tsx", import.meta.url), "utf8");
const mobileRail = source.slice(source.indexOf("/* Mobile: horizontal scrollable pill bar */"), source.indexOf("/* Desktop: toggle list */"));

test("the normal mobile preset rail keeps selection controls and one terminal manager entry", () => {
  assert.match(mobileRail, /role="option"/);
  assert.match(mobileRail, /min-h-11/);
  assert.match(mobileRail, /aria-label="パターン管理"/);
  assert.doesNotMatch(mobileRail, /Pencil|を編集|パターンを追加/);
});

test("pattern management preserves selection and ownership/editability guards", () => {
  assert.match(mobileRail, /disabled=\{!canActivate\}/);
  assert.match(source, /const editable = canEdit && p\.user_id === userId/);
  assert.match(source, /disabled=\{!editable\}/);
  assert.match(source, /!canEdit && editDisabledHint/);
});

test("pattern management hands off additions and edits to the existing preset dialog", () => {
  assert.match(source, /<DialogTitle>パターン管理<\/DialogTitle>/);
  assert.match(source, /新しいパターンを追加/);
  assert.match(source, /onClick=\{\(\) => openEdit\(p, true\)\}/);
  assert.match(source, /onClick=\{\(\) => openNew\(true\)\}/);
  assert.match(source, /<PresetDialog/);
  assert.match(source, /if \(!open && returnToManager\) setManagerOpen\(true\)/);
});
