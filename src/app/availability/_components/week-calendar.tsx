"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  computeDaySummaries,
  endMinutes,
  expandToSlots,
  isDateEditable,
  isRangeCovered,
  minutesToTime,
  startMinutes,
} from "@/lib/availability";
import type { Preset, Profile, Slot } from "@/lib/types";

function displayTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function WeekCalendar({
  cursorDate,
  members,
  visibleIds,
  currentUserId,
  slots,
  activePreset,
  canEdit,
  window: editableWindow,
  onPaint,
}: {
  cursorDate: Date;
  members: Profile[];
  visibleIds: Set<string>;
  currentUserId: string;
  slots: Slot[];
  activePreset: Preset | null;
  canEdit: boolean;
  window: { min: string; max: string };
  onPaint: (dates: string[], action: "apply" | "remove", preset: Preset) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursorDate, { weekStartsOn: 0 }), index)), [cursorDate]);
  const visibleMembers = useMemo(() => members.filter((member) => visibleIds.has(member.id)), [members, visibleIds]);
  const dates = useMemo(() => days.map((day) => format(day, "yyyy-MM-dd")), [days]);
  const slotsByUserDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = `${slot.user_id}|${slot.date}`;
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  }, [slots]);
  const freeIdsByCell = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const member of visibleMembers) {
      for (const date of dates) {
        for (const time of expandToSlots(slotsByUserDate.get(`${member.id}|${date}`) ?? [])) {
          const key = `${date}|${time}`;
          const free = map.get(key) ?? new Set<string>();
          free.add(member.id);
          map.set(key, free);
        }
      }
    }
    return map;
  }, [dates, slotsByUserDate, visibleMembers]);
  const summaries = useMemo(() => computeDaySummaries(dates, visibleMembers, visibleMembers.map((member) => member.id), slots), [dates, slots, visibleMembers]);
  const rows = useMemo(() => {
    const displayedSlots = slots.filter((slot) => visibleIds.has(slot.user_id));
    if (displayedSlots.length === 0) return Array.from({ length: 14 }, (_, index) => 18 * 60 + index * 30);
    const min = Math.floor(Math.min(...displayedSlots.map((slot) => startMinutes(slot.start_time))) / 30) * 30;
    const max = Math.ceil(Math.max(...displayedSlots.map((slot) => endMinutes(slot.end_time))) / 30) * 30;
    return Array.from({ length: Math.max(1, (max - min) / 30) }, (_, index) => min + index * 30);
  }, [slots, visibleIds]);

  const [dragging, setDragging] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const visitedRef = useRef(new Set<string>());
  const actionRef = useRef<"apply" | "remove" | null>(null);
  const presetRef = useRef(activePreset);
  const onPaintRef = useRef(onPaint);

  useEffect(() => {
    presetRef.current = activePreset;
    onPaintRef.current = onPaint;
  }, [activePreset, onPaint]);

  useEffect(() => {
    function finish(cancel = false) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (!cancel && presetRef.current && actionRef.current && visitedRef.current.size) {
        onPaintRef.current(Array.from(visitedRef.current), actionRef.current, presetRef.current);
      }
      visitedRef.current = new Set();
      setVisited(new Set());
    }
    function move(event: PointerEvent) {
      if (!draggingRef.current) return;
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const date = element?.closest<HTMLElement>("[data-week-date]")?.dataset.weekDate;
      if (!date || !presetRef.current || !isDateEditable(date, editableWindow) || visitedRef.current.has(date)) return;
      visitedRef.current = new Set(visitedRef.current).add(date);
      setVisited(new Set(visitedRef.current));
    }
    const onUp = () => finish();
    const cancel = () => finish(true);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointermove", move, { passive: false });
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointermove", move);
    };
  }, [editableWindow]);

  function isAppliedByActivePreset(date: string) {
    return Boolean(activePreset && isRangeCovered(slotsByUserDate.get(`${currentUserId}|${date}`) ?? [], activePreset.start_time, activePreset.end_time));
  }
  function startPaint(date: string, event: React.PointerEvent) {
    if (!canEdit || !activePreset || !isDateEditable(date, editableWindow)) return;
    event.preventDefault();
    draggingRef.current = true;
    actionRef.current = isAppliedByActivePreset(date) ? "remove" : "apply";
    visitedRef.current = new Set([date]);
    setVisited(new Set([date]));
    setDragging(true);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="grid min-w-[44rem] grid-cols-[4rem_repeat(7,minmax(6rem,1fr))] border-b text-center text-xs font-medium">
        <div />
        {days.map((day) => {
          const summary = summaries.get(format(day, "yyyy-MM-dd"));
          return <div key={format(day, "yyyy-MM-dd")} className="border-l py-2">{format(day, "M/d (E)", { locale: ja })}<div className="text-[10px] text-muted-foreground">{summary?.registeredIds.length ?? 0}人登録済み / {visibleMembers.length}人中</div></div>;
        })}
      </div>
      <div className="grid min-w-[44rem] grid-cols-[4rem_repeat(7,minmax(6rem,1fr))]">
        {rows.map((minute) => (
          <div key={minute} className="contents">
            <div className="h-7 border-b pr-1 text-right text-[10px] leading-7 text-muted-foreground">{displayTime(minute)}</div>
            {days.map((day) => {
              const date = format(day, "yyyy-MM-dd");
              const cellStart = minutesToTime(minute);
              const cellEnd = minutesToTime(minute + 30);
              const freeMembers = minute < 1440 ? visibleMembers.filter((member) => freeIdsByCell.get(`${date}|${cellStart}`)?.has(member.id)) : [];
              const summary = summaries.get(date);
              const isFullOverlap = Boolean(summary?.fullMatch && minute < 1440 && isRangeCovered(summary.commonRanges, cellStart, cellEnd));
              const isSoftOverlap = Boolean(summary?.softMatch && minute < 1440 && isRangeCovered(summary.commonRanges, cellStart, cellEnd));
              const unregisteredNames = summary?.unregisteredIds.map((id) => members.find((member) => member.id === id)?.nickname ?? "不明").join("・") ?? "";
              return (
                <div
                  key={`${date}-${minute}`}
                  data-week-date={date}
                  onPointerDown={(event) => startPaint(date, event)}
                  className={cn("relative h-7 border-b border-l px-0.5", isFullOverlap && "overlap-block", isSoftOverlap && !isFullOverlap && "bg-overlap-soft/40", canEdit && activePreset && isDateEditable(date, editableWindow) && "cursor-pointer", dragging && "touch-none", visited.has(date) && "ring-1 ring-inset ring-primary/50")}
                  style={{ touchAction: canEdit && activePreset && isDateEditable(date, editableWindow) ? "none" : "auto" }}
                  title={`${date} ${displayTime(minute)}${isSoftOverlap ? `（${unregisteredNames}未登録）` : ""}`}
                >
                  {freeMembers.length > 0 && <div className="flex h-3 items-center gap-0.5 pt-0.5">{freeMembers.slice(0, 3).map((member) => <span key={member.id} className="h-2 flex-1 rounded-sm" style={{ backgroundColor: member.color }} title={`${member.nickname}: 空き`} />)}{freeMembers.length > 3 && <span className="text-[9px] leading-none">+{freeMembers.length - 3}</span>}</div>}
                  {isSoftOverlap && <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-[8px] leading-3 text-overlap-foreground">{unregisteredNames}未登録</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
