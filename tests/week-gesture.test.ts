import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchGesture, shouldCommitWeekGesture } from "../src/lib/week-gesture.ts";

test("horizontal touch movement remains a scroll gesture and never commits", () => {
  const intent = resolveTouchGesture({ clientX: 100, clientY: 100 }, { clientX: 132, clientY: 105 });
  assert.equal(intent, "scroll");
  assert.equal(shouldCommitWeekGesture(intent), false);
});

test("vertical touch movement becomes a time-range selection", () => {
  const intent = resolveTouchGesture({ clientX: 100, clientY: 100 }, { clientX: 104, clientY: 134 });
  assert.equal(intent, "select");
  assert.equal(shouldCommitWeekGesture(intent), true);
});

test("short touch movement remains a tap candidate", () => {
  const intent = resolveTouchGesture({ clientX: 100, clientY: 100 }, { clientX: 106, clientY: 104 });
  assert.equal(intent, "pending");
  assert.equal(shouldCommitWeekGesture(intent), true);
});

test("a cancelled pointer gesture never commits", () => {
  assert.equal(shouldCommitWeekGesture("select", true), false);
  assert.equal(shouldCommitWeekGesture("pending", true), false);
});
