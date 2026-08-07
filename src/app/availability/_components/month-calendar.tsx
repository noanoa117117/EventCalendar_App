"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { isDateEditable, isRangeCovered, monthGridRange } from "@/lib/availability";
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
}: {
  cursorDate: Date;
  members: Profile[];
  visibleIds: Set<string>;
  currentUserId: string;
  slots: Slot[];
  activePreset: Preset | null;
  window: { min: string; max: string };
  onPaint: (dates: string[], action: "apply" | "remove", preset: Preset) => void;
}) {
  const { start: gridStart, end: gridEnd } = monthGridRange(cursorDate);

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

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

  const [dragging, setDragging] = useState(false);
  const [anchorAction, setAnchorAction] = useState<"apply" | "remove" | null>(null);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const draggingRef = useRef(false);

  useEffect(() => {
    function finish() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      if (activePreset && anchorAction && visited.size > 0) {
        onPaint(Array.from(visited), anchorAction, activePreset);
      }
      setVisited(new Set());
      setAnchorAction(null);
    }
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visited, anchorAction, activePreset]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && draggingRef.current) {
        draggingRef.current = false;
        setDragging(false);
        setVisited(new Set());
        setAnchorAction(null);
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

  function handlePointerDown(dateStr: string) {
    if (!activePreset || !isEditable(dateStr)) return;
    draggingRef.current = true;
    setDragging(true);
    const applied = isAppliedByActivePreset(dateStr);
    setAnchorAction(applied ? "remove" : "apply");
    setVisited(new Set([dateStr]));
  }

  function handlePointerEnter(dateStr: string) {
    if (!draggingRef.current || !activePreset || !isEditable(dateStr)) return;
    setVisited((prev) => {
      if (prev.has(dateStr)) return prev;
      const next = new Set(prev);
      next.add(dateStr);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, cursorDate);
          const editable = isEditable(dateStr);
          const applied = isAppliedByActivePreset(dateStr);
          const isVisitedNow = visited.has(dateStr);
          const dotMembers = members.filter(
            (m) =>
              visibleIds.has(m.id) &&
              (slotsByUserDate.get(`${m.id}|${dateStr}`) ?? []).length > 0,
          );

          return (
            <div
              key={dateStr}
              onPointerDown={() => handlePointerDown(dateStr)}
              onPointerEnter={() => handlePointerEnter(dateStr)}
              className={cn(
                "flex select-none flex-col gap-1 border-b border-r p-1.5 text-left align-top",
                !inMonth && "bg-muted/30",
                editable && activePreset && "cursor-pointer",
                !editable && "bg-muted/50",
              )}
              style={
                isVisitedNow
                  ? {
                      backgroundColor: activePreset
                        ? `${activePreset.color}55`
                        : undefined,
                    }
                  : applied
                    ? { backgroundColor: `${activePreset?.color}2a` }
                    : undefined
              }
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
              <div className="flex flex-wrap gap-0.5">
                {dotMembers.map((m) => (
                  <span
                    key={m.id}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: m.color }}
                    title={m.nickname}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {dragging && (
        <p className="pointer-events-none px-1 pt-1 text-xs text-muted-foreground">
          ドラッグ中... 離すと確定します（Escで取り消し）
        </p>
      )}
    </div>
  );
}
