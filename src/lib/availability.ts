import {
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// Timezone is fixed to Asia/Tokyo for the whole app (REQUIREMENTS.md
// section 7), independent of the viewer's device timezone.
export const APP_TIME_ZONE = "Asia/Tokyo";

export function jstNow(): Date {
  return toZonedTime(new Date(), APP_TIME_ZONE);
}

export function jstToday(): string {
  return formatInTimeZone(new Date(), APP_TIME_ZONE, "yyyy-MM-dd");
}

// Registrable window: today through the last day of (current month + 3
// months), per REQUIREMENTS.md section 5.
export function registrableWindow(): { min: string; max: string } {
  const min = jstToday();
  // Treat the Tokyo date as a calendar value. Constructing a local-midnight
  // Date and then applying date-fns arithmetic can cross a day when the
  // browser timezone is ahead of Tokyo.
  const [year, month] = min.split("-").map(Number);
  const max = new Date(Date.UTC(year, month - 1 + 4, 0));
  return {
    min,
    max: formatInTimeZone(max, "UTC", "yyyy-MM-dd"),
  };
}

export function isDateEditable(dateStr: string, window = registrableWindow()) {
  return dateStr >= window.min && dateStr <= window.max;
}

// Full-weeks grid around a month, Sunday-start (matches MonthCalendar).
export function monthGridRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 0 }),
  };
}

export interface TimeRange {
  start_time: string;
  end_time: string;
}

export interface AvailabilityOperation {
  dates: string[];
  start: string;
  end: string;
  active: boolean;
  presetId: string | null;
}

/** Apply staged operations in order, preserving other members' rows. */
export function applyAvailabilityOperations(
  serverSlots: Array<TimeRange & Pick<import("./types").Slot, "id" | "user_id" | "date" | "preset_id">>,
  operations: AvailabilityOperation[],
  currentUserId: string,
): import("./types").Slot[] {
  const rows = serverSlots.map((s) => ({ ...s }));
  let sequence = 0;
  for (const op of operations) {
    for (const date of op.dates) {
      const own = rows.filter((s) => s.user_id === currentUserId && s.date === date);
      rows.splice(0, rows.length, ...rows.filter((s) => !(s.user_id === currentUserId && s.date === date)));
      const start = startMinutes(op.start);
      const end = endMinutes(op.end);
      if (op.active) {
        let mergedStart = start;
        let mergedEnd = end;
        let merged = false;
        const untouched = [] as typeof own;
        for (const row of own) {
          const rs = startMinutes(row.start_time);
          const re = endMinutes(row.end_time);
          if (rs <= mergedEnd && re >= mergedStart) {
            mergedStart = Math.min(mergedStart, rs);
            mergedEnd = Math.max(mergedEnd, re);
            merged = true;
          } else {
            untouched.push(row);
          }
        }
        rows.push(...untouched);
        rows.push({
          id: merged ? `draft-${sequence++}` : `draft-${sequence++}`,
          user_id: currentUserId,
          date,
          start_time: minutesToTime(mergedStart),
          end_time: minutesToTime(mergedEnd),
          preset_id: merged ? null : op.presetId,
        });
      } else {
        for (const row of own) {
          const rs = startMinutes(row.start_time);
          const re = endMinutes(row.end_time);
          if (re <= start || rs >= end) {
            rows.push(row);
            continue;
          }
          if (rs < start) rows.push({ ...row, id: `draft-${sequence++}`, end_time: minutesToTime(start) });
          if (re > end) rows.push({ ...row, id: `draft-${sequence++}`, start_time: minutesToTime(end) });
        }
      }
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || startMinutes(a.start_time) - startMinutes(b.start_time) || a.user_id.localeCompare(b.user_id));
}

// Minutes since midnight. '00:00:00' as an *end* time is a sentinel for
// "end of day" (24:00) - see supabase/migrations/0001_init.sql. Never
// pass a start time into this treating it as an end.
export function endMinutes(time: string): number {
  if (time.startsWith("00:00")) return 1440;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function startMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  if (min >= 1440) return "00:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// True when [start,end) is fully covered by the union of the given
// same-day ranges - mirrors public.set_availability's merge semantics.
export function isRangeCovered(ranges: TimeRange[], start: string, end: string) {
  const targetStart = startMinutes(start);
  const targetEnd = endMinutes(end);
  const intervals = ranges
    .map((r) => [startMinutes(r.start_time), endMinutes(r.end_time)] as const)
    .sort((a, b) => a[0] - b[0]);

  let cursor = targetStart;
  for (const [s, e] of intervals) {
    if (s > cursor) break;
    if (e > cursor) cursor = e;
    if (cursor >= targetEnd) return true;
  }
  return cursor >= targetEnd;
}

// Renders a stored time value for display. Pass isEnd=true for end_time
// columns, where '00:00' is the end-of-day sentinel and should read
// "24:00" rather than "00:00".
export function formatTimeLabel(time: string, isEnd = false) {
  const hhmm = time.slice(0, 5);
  if (isEnd && hhmm === "00:00") return "24:00";
  return hhmm;
}

/** Expand stored ranges into unique, half-open 30-minute cells in memory. */
export function expandToSlots(ranges: TimeRange[]): string[] {
  const cells = new Set<string>();
  for (const range of ranges) {
    const start = Math.max(0, startMinutes(range.start_time));
    const end = Math.min(1440, endMinutes(range.end_time));
    for (let minute = start; minute + 30 <= end; minute += 30) {
      cells.add(minutesToTime(minute));
    }
  }
  return Array.from(cells).sort();
}
