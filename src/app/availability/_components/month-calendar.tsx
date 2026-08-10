"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { computeDaySummaries, formatTimeLabel, isDateEditable, isRangeCovered, monthGridRange, startMinutes, endMinutes } from "@/lib/availability";
import type { TimeRange } from "@/lib/availability";
import type { Preset, Profile, Slot } from "@/lib/types";

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
      return longest > bestLongest ? summary : best;
    }, null);
  }, [summaries]);

  const [dragging, setDragging] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const visitedRef = useRef(new Set<string>());
  const actionRef = useRef<"apply" | "remove" | null>(null);
  const presetRef = useRef(activePreset);
  // The global pointer listeners mount once, so dispatch through the current render's callback.
  const onPaintRef = useRef(onPaint);
  onPaintRef.current = onPaint;
  useEffect(() => { presetRef.current = activePreset; }, [activePreset]);

  useEffect(() => {
    function finish(cancel = false) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (!cancel && presetRef.current && actionRef.current && visitedRef.current.size > 0) {
        onPaintRef.current(Array.from(visitedRef.current), actionRef.current, presetRef.current);
      }
      visitedRef.current = new Set();
      setVisited(new Set());
    }
    function move(e: PointerEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const date = el?.closest<HTMLElement>("[data-date]")?.dataset.date;
      if (date) handlePointerEnter(date);
    }
    const onUp = () => finish();
    const onCancel = () => finish(true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointermove", move, { passive: false });
    return () => { window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onCancel); window.removeEventListener("pointermove", move); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && draggingRef.current) {
        draggingRef.current = false;
        visitedRef.current = new Set();
        setDragging(false);
        setVisited(new Set());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function isEditable(dateStr: string) {
    return isDateEditable(dateStr, editableWindow);
  }

  function isAppliedByActivePreset(dateStr: string) {
    if (!activePreset) return false;
    const daySlots = slotsByUserDate.get(`${currentUserId}|${dateStr}`) ?? [];
    return isRangeCovered(daySlots, activePreset.start_time, activePreset.end_time);
  }

  function handlePointerDown(dateStr: string, e?: React.PointerEvent) {
    if (!canEdit || !activePreset || !isEditable(dateStr)) return;
    e?.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    const applied = isAppliedByActivePreset(dateStr);
    actionRef.current = applied ? "remove" : "apply";
    visitedRef.current = new Set([dateStr]);
    setVisited(visitedRef.current);
  }

  function handlePointerEnter(dateStr: string) {
    if (!canEdit || !draggingRef.current || !presetRef.current || !isEditable(dateStr)) return;
    visitedRef.current = new Set(visitedRef.current);
    if (visitedRef.current.has(dateStr)) return;
    visitedRef.current.add(dateStr);
    setVisited((prev) => {
      if (prev.has(dateStr)) return prev;
      const next = new Set(prev);
      next.add(dateStr);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      {bestDay && (
        <div className="flex items-center gap-2 border-b bg-overlap-soft/30 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 font-medium text-overlap-foreground">
            {bestDay.fullMatch
              ? `${format(new Date(`${bestDay.date}T00:00:00`), "M/d (E)", { locale: ja })} 全員OK ${formatCommonRange(bestDay.commonRanges)}`
              : `${format(new Date(`${bestDay.date}T00:00:00`), "M/d (E)", { locale: ja })} ${bestDay.registeredIds.length}人OK ${formatCommonRange(bestDay.commonRanges)}（${bestDay.unregisteredIds.map(nickname).join("・")}未登録）`}
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

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              onPointerDown={(e) => handlePointerDown(dateStr, e)}
              onPointerEnter={() => handlePointerEnter(dateStr)}
              onClick={() => { if ((!canEdit || !activePreset) && onSelectDate) onSelectDate(dateStr); }}
              className={cn(
                "flex select-none flex-col gap-1 p-1.5 text-left align-top",
                !inMonth && "bg-muted/30",
                editable && canEdit && activePreset && "cursor-pointer",
                !editable && "bg-muted/50",
                dragging && "touch-none",
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
                <div className="rounded bg-overlap-soft/40 px-1 py-0.5 text-[11px] leading-tight text-overlap-foreground">
                  {summary.registeredIds.length}人OK <span className="text-warning-foreground">({summary.unregisteredIds.map(nickname).join("・")}未登録)</span>
                </div>
              )}
              <div className="flex flex-wrap gap-0.5">
                {visibleMembers.map((m) => (
                  <span key={m.id} className={cn("size-1.5 rounded-full", !summary?.registeredIds.includes(m.id) && "bg-muted-foreground/20")} style={summary?.registeredIds.includes(m.id) ? { backgroundColor: m.color } : undefined} title={`${m.nickname}: ${summary?.registeredIds.includes(m.id) ? "登録済み" : "未登録"}`} aria-label={`${m.nickname}: ${summary?.registeredIds.includes(m.id) ? "登録済み" : "未登録"}`} />
                ))}
              </div>
              {selfSlots.length > 0 && <span className="text-[10px] text-free-foreground">{formatTimeLabel(selfSlots[0].start_time)}〜</span>}
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
