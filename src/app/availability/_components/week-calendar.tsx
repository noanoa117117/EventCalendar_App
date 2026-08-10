"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
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
import { useDragPaint } from "./use-drag-paint";

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
  const router = useRouter();
  // Keep the date selected from the month view in the middle, with context on either side.
  const days = useMemo(() => [-1, 0, 1].map((offset) => addDays(cursorDate, offset)), [cursorDate]);
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

  const isAppliedByActivePreset = (date: string) => {
    return Boolean(activePreset && isRangeCovered(slotsByUserDate.get(`${currentUserId}|${date}`) ?? [], activePreset.start_time, activePreset.end_time));
  };
  const { dragging, visited, draggingRef, onPointerDown: startPaint, onPointerEnter } = useDragPaint({ canEdit, activePreset, onPaint, isEditable: (date) => isDateEditable(date, editableWindow), isApplied: isAppliedByActivePreset, selector: "[data-week-date]" });
  const navigateToPlanning = (date: string, start: string) => {
    const params = new URLSearchParams({ date, start, members: visibleMembers.map((member) => member.id).join(",") });
    router.push(`/planning?${params.toString()}`);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid min-w-[24rem] grid-cols-[4rem_repeat(3,minmax(0,1fr))] border-b text-center text-xs font-medium">
        <div />
        {days.map((day) => {
          const summary = summaries.get(format(day, "yyyy-MM-dd"));
          const registered = summary?.registeredIds.length ?? 0;
          const total = visibleMembers.length;
          return <div key={format(day, "yyyy-MM-dd")} className="border-l px-1 py-2">{format(day, "M/d (E)", { locale: ja })}<div className="text-[10px] text-muted-foreground">表示中 {registered}人登録済み / {total}人中</div><div role="progressbar" aria-label={`${format(day, "M月d日", { locale: ja })} 登録状況`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={registered} className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: total ? `${registered / total * 100}%` : "0%" }} /></div></div>;
        })}
      </div>
      <div className="grid min-w-[24rem] grid-cols-[4rem_repeat(3,minmax(0,1fr))]">
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
              const canOpenPlanning = isFullOverlap && !activePreset;
              const hasOtherMemberAvailability = Boolean(summary?.registeredIds.some((id) => id !== currentUserId));
              const unregisteredNames = summary?.unregisteredIds.map((id) => members.find((member) => member.id === id)?.nickname ?? "不明").join("・") ?? "";
              return (
                <div
                  key={`${date}-${minute}`}
                  data-week-date={date}
                  onPointerDown={(event) => startPaint(date, event)}
                  onPointerEnter={() => onPointerEnter(date)}
                  role={canOpenPlanning ? "button" : undefined}
                  tabIndex={canOpenPlanning ? 0 : undefined}
                  aria-label={canOpenPlanning ? `${date} ${displayTime(minute)} 全員の共通空き時間から企画` : undefined}
                  onClick={() => {
                    if (!canOpenPlanning || draggingRef.current) return;
                    navigateToPlanning(date, cellStart);
                  }}
                  onKeyDown={(event) => {
                    if (canOpenPlanning && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      navigateToPlanning(date, cellStart);
                    }
                  }}
                  className={cn("relative h-7 border-b border-l px-0.5", isFullOverlap && "overlap-block", isSoftOverlap && !isFullOverlap && "overlap-soft-block", canEdit && activePreset && isDateEditable(date, editableWindow) && "cursor-pointer", dragging && "touch-none", visited.has(date) && "ring-1 ring-inset ring-primary/50")}
                  style={{ touchAction: canEdit && activePreset && isDateEditable(date, editableWindow) ? "none" : "auto" }}
                  title={`${date} ${displayTime(minute)}${isSoftOverlap ? `（${unregisteredNames}未登録）` : ""}`}
                >
                  <div className="grid h-full items-stretch gap-px py-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(visibleMembers.length, 1)}, minmax(0, 1fr))` }}>
                    {visibleMembers.map((member) => {
                      const isFree = freeMembers.some((freeMember) => freeMember.id === member.id);
                      const isUnregistered = hasOtherMemberAvailability && summary?.unregisteredIds.includes(member.id);
                      return isFree
                        ? <span key={member.id} className="min-w-0 rounded-sm" style={{ backgroundColor: member.color }} title={`${member.nickname}: 空き`} />
                        : isUnregistered
                          ? <span key={member.id} className="min-w-0 rounded-sm border-2 border-dotted bg-transparent" style={{ borderColor: member.color }} title={`${member.nickname}: 未登録`} />
                          : <span key={member.id} aria-hidden="true" />;
                    })}
                  </div>
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
