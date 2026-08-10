"use client";

import { useMemo } from "react";
import { addDays, format, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { computeDaySummaries, formatTimeLabel, isDateEditable, isRangeCovered, monthGridRange, startMinutes, endMinutes } from "@/lib/availability";
import type { TimeRange } from "@/lib/availability";
import type { Preset, Profile, Slot } from "@/lib/types";
import { useDragPaint } from "./use-drag-paint";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function MonthCalendar({
  cursorDate,
  members,
  visibleIds,
  currentUserId,
  slots,
  activePreset,
  window: editableWindow,
  onPaint,
  canEdit,
  onSelectDate,
}: {
  cursorDate: Date;
  members: Profile[];
  visibleIds: Set<string>;
  currentUserId: string;
  slots: Slot[];
  activePreset: Preset | null;
  window: { min: string; max: string };
  onPaint: (dates: string[], action: "apply" | "remove", preset: Preset) => void;
  canEdit: boolean;
  onSelectDate?: (date: string) => void;
}) {
  const { start: gridStart, end: gridEnd } = monthGridRange(cursorDate);

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) result.push(d);
    return result;
  }, [gridStart, gridEnd]);

  const slotsByUserDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = `${s.user_id}|${s.date}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [slots]);
  const visibleMembers = members.filter((m) => visibleIds.has(m.id));
  const summaries = useMemo(() => computeDaySummaries(days.map((d) => format(d, "yyyy-MM-dd")), visibleMembers, visibleMembers.map((m) => m.id), slots), [slots, visibleMembers, days]);
  const nickname = (id: string) => members.find((member) => member.id === id)?.nickname ?? "不明";
  const formatCommonRange = (ranges: TimeRange[]) =>
    ranges.map((range) => `${formatTimeLabel(range.start_time)}〜${formatTimeLabel(range.end_time, true)}`).join("、");
  const bestDay = useMemo(() => {
    const candidates = Array.from(summaries.values()).filter((summary) => summary.fullMatch || summary.softMatch);
    return candidates.reduce<typeof candidates[number] | null>((best, summary) => {
      const longest = Math.max(...summary.commonRanges.map((range) => endMinutes(range.end_time) - startMinutes(range.start_time)));
      const bestLongest = best ? Math.max(...best.commonRanges.map((range) => endMinutes(range.end_time) - startMinutes(range.start_time))) : -1;
      return longest > bestLongest || (longest === bestLongest && summary.fullMatch && !best?.fullMatch) ? summary : best;
    }, null);
  }, [summaries]);

  const isEditable = (dateStr: string) => isDateEditable(dateStr, editableWindow);
  const isAppliedByActivePreset = (dateStr: string) => {
    if (!activePreset) return false;
    const daySlots = slotsByUserDate.get(`${currentUserId}|${dateStr}`) ?? [];
    return isRangeCovered(daySlots, activePreset.start_time, activePreset.end_time);
  };
  const { dragging, visited, onPointerDown, onPointerEnter } = useDragPaint({ canEdit, activePreset, onPaint, isEditable, isApplied: isAppliedByActivePreset });

  return (
    <div className="flex h-full flex-col">
      {bestDay && (
        <div className={cn("items-center gap-2 border-b bg-overlap-soft/30 px-3 py-2 text-sm", bestDay.fullMatch ? "flex" : "hidden sm:flex")}>
          <span className="min-w-0 flex-1 font-medium text-overlap-foreground">
            {bestDay.fullMatch
              ? `${format(new Date(`${bestDay.date}T00:00:00`), "M/d (E)", { locale: ja })} 全員OK ${formatCommonRange(bestDay.commonRanges)}`
              : `${format(new Date(`${bestDay.date}T00:00:00`), "M/d (E)", { locale: ja })} ${bestDay.registeredIds.length}人OK ${formatCommonRange(bestDay.commonRanges)}・未登録${bestDay.unregisteredIds.length}人`}
          </span>
          <button type="button" className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-background" onClick={() => onSelectDate?.(bestDay.date)}>詳細を見る</button>
        </div>
      )}
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 auto-rows-[minmax(var(--cell-min-h),1fr)] overflow-y-auto grid-rules">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, cursorDate);
          const editable = isEditable(dateStr);
          const applied = isAppliedByActivePreset(dateStr);
          const isVisitedNow = visited.has(dateStr);
          const summary = summaries.get(dateStr);
          const selfSlots = slotsByUserDate.get(`${currentUserId}|${dateStr}`) ?? [];
          const singleMember = visibleMembers.length === 1 ? visibleMembers[0] : null;
          const singleMemberSlots = singleMember ? slotsByUserDate.get(`${singleMember.id}|${dateStr}`) ?? [] : [];

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              onPointerDown={(e) => onPointerDown(dateStr, e)}
              onPointerEnter={() => onPointerEnter(dateStr)}
              onClick={() => { if ((!canEdit || !activePreset) && onSelectDate) onSelectDate(dateStr); }}
              className={cn(
                "flex select-none flex-col gap-1 p-1.5 text-left align-top",
                !inMonth && "bg-muted/30",
                editable && canEdit && activePreset && "cursor-pointer",
                !editable && "bg-muted/50",
                dragging && "touch-none",
                summary?.registeredIds.length === 0 && "availability-unregistered",
              )}
              style={{ touchAction: canEdit && activePreset && editable ? "none" : "auto", ...(canEdit && (isVisitedNow || applied) && activePreset ? { backgroundColor: `color-mix(in oklab, ${activePreset.color} 14%, var(--card))`, borderLeft: `3px solid ${activePreset.color}` } : {}) }}
            >
              <span
                className={cn(
                  "text-xs",
                  !inMonth && "text-muted-foreground/50",
                  !editable && inMonth && "text-muted-foreground",
                )}
              >
                {format(day, "d", { locale: ja })}
              </span>
              {summary?.fullMatch && (
                <div className="overlap-block rounded px-1 py-0.5 text-[11px] leading-tight">
                  全員OK {formatCommonRange(summary.commonRanges)}
                </div>
              )}
              {summary?.softMatch && !summary.fullMatch && (
                <div className="overlap-soft-block hidden rounded px-1 py-0.5 text-[11px] leading-tight text-overlap-foreground sm:block">
                  {summary.registeredIds.length}人OK <span className="text-warning-foreground">({summary.unregisteredIds.map(nickname).join("・")}未登録)</span>
                </div>
              )}
              <div className="flex flex-wrap gap-0.5">
                {visibleMembers.map((m) => (
                  <span key={m.id} className={cn("size-1.5 rounded-full", !summary?.registeredIds.includes(m.id) && "bg-muted-foreground/20")} style={summary?.registeredIds.includes(m.id) ? { backgroundColor: m.color } : undefined} title={`${m.nickname}: ${summary?.registeredIds.includes(m.id) ? "登録済み" : "未登録"}`} aria-label={`${m.nickname}: ${summary?.registeredIds.includes(m.id) ? "登録済み" : "未登録"}`} />
                ))}
              </div>
              {singleMemberSlots.length > 0 && (
                <div className="flex flex-wrap gap-x-1 text-[10px] text-free-foreground" title={singleMemberSlots.map((slot) => `${formatTimeLabel(slot.start_time)}〜${formatTimeLabel(slot.end_time, true)}`).join("、")}>
                  {[...singleMemberSlots].sort((a, b) => a.start_time.localeCompare(b.start_time)).map((slot) => <span key={slot.id}>{formatTimeLabel(slot.start_time)}〜{formatTimeLabel(slot.end_time, true)}</span>)}
                </div>
              )}
              {visibleMembers.length !== 1 && selfSlots.length > 0 && <span className="text-[10px] text-free-foreground">{formatTimeLabel(selfSlots[0].start_time)}〜</span>}
              {!canEdit && <span className="pointer-events-none mt-auto self-end text-[10px] text-muted-foreground">詳細 ›</span>}
            </div>
          );
        })}
      </div>
      {dragging && (
        <p className="pointer-events-none px-1 pt-1 text-xs text-muted-foreground">
          登録中… 離すと確定します（Escで取り消し）
        </p>
      )}
    </div>
  );
}
