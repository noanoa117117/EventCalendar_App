export type WeekGestureIntent = "pending" | "scroll" | "select";

export type PointerPoint = {
  clientX: number;
  clientY: number;
};

const TOUCH_MOVE_THRESHOLD = 12;

/**
 * Keep a touch gesture undecided until it has moved enough to distinguish a
 * horizontal pan from a vertical time-range selection. Mouse/pen input uses
 * the established immediate drag behaviour in the calendar component.
 */
export function resolveTouchGesture(
  start: PointerPoint,
  current: PointerPoint,
  threshold = TOUCH_MOVE_THRESHOLD,
): WeekGestureIntent {
  const horizontal = Math.abs(current.clientX - start.clientX);
  const vertical = Math.abs(current.clientY - start.clientY);
  if (Math.max(horizontal, vertical) < threshold) return "pending";
  return horizontal > vertical ? "scroll" : "select";
}

export function shouldCommitWeekGesture(intent: WeekGestureIntent, wasCancelled = false) {
  return !wasCancelled && intent !== "scroll";
}
