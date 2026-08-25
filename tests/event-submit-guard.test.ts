import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/events/event-calendar.tsx", import.meta.url),
  "utf8",
);

test("event form synchronously rejects repeated submissions", () => {
  assert.match(source, /const submittingRef = useRef\(false\)/);
  assert.match(source, /if \(submittingRef\.current\) return;/);
  assert.match(
    source,
    /submittingRef\.current = true;[\s\S]*await onSubmit\(form\)/,
  );
});

test("event form always releases its submission lock", () => {
  assert.match(
    source,
    /finally \{[\s\S]*submittingRef\.current = false;[\s\S]*setIsSubmitting\(false\)/,
  );
});

test("event form disables actions and reports progress while saving", () => {
  assert.match(source, /disabled=\{isSubmitting\}>閉じる/);
  assert.match(source, /disabled=\{isSubmitting\}>\{isSubmitting \? "保存中\.\.\." : "保存"\}/);
});
