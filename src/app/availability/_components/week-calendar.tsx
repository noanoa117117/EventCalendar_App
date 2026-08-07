"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { isDateEditable, minutesToTime, weekRange } from "@/lib/availability";
import type { Profile, Slot } from "@/lib/types";

const ROWS = 48; // 30-minute rows across a full day
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function slotCoversRow(slot: Slot, rowStartMin: number, rowEndMin: number) {
  const sMin =
    Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5));
  const eMin = slot.end_time.slice(0, 5) === "00:00"
    ? 1440
    : Number(slot.end_time.slice(0, 2)) * 60 + Number(slot.end_time.slice(3, 5));
  return sMin <= rowStartMin && eMin >= rowEndMin;
}

export function WeekCalendar({
  cursorDate,
  members,
  visibleIds,
  currentUserId,
  slots,
  window: editableWindow,
  onDragCommit,
  canEdit,
}: {
  cursorDate: Date;
  members: Profile[];
  visibleIds: Set<string>;
  currentUserId: string;
  slots: Slot[];
  window: { min: string; max: string };
  onDragCommit: (date: string, start: string, end: string, action: "apply" | "remove") => void;
  canEdit: boolean;
}) {
  const { start: weekStart } = weekRange(cursorDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const orderedVisible = useMemo(() => {
    const list = members.filter((m) => visibleIds.has(m.id));
    list.sort((a, b) =>
      a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : a.nickname.localeCompare(b.nickname),
    );
    return list;
  }, [members, visibleIds, currentUserId]);

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

  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragRows, setDragRows] = useState<[number, number] | null>(null);
  const draggingRef = useRef(false);
  const dragDateRef = useRef<string | null>(null);
  const dragActionRef = useRef<"apply" | "remove" | null>(null);
  const dragRowsRef = useRef<[number, number] | null>(null);

  function isEditable(dateStr: string) {
    return isDateEditable(dateStr, editableWindow);
  }

  function isOwnRowCovered(dateStr: string, row: number) {
    const daySlots = slotsByUserDate.get(`${currentUserId}|${dateStr}`) ?? [];
    return daySlots.some((s) => slotCoversRow(s, row * 30, (row + 1) * 30));
  }

  function handleDown(dateStr: string, row: number) {
    if (!canEdit || !isEditable(dateStr)) return;
    draggingRef.current = true;
    dragDateRef.current = dateStr;
    dragActionRef.current = isOwnRowCovered(dateStr, row) ? "remove" : "apply";
    dragRowsRef.current = [row, row];
    setDragDate(dateStr);
    setDragRows([row, row]);
  }

  function handleEnter(dateStr: string, row: number) {
    if (!canEdit || !draggingRef.current || dateStr !== dragDateRef.current) return;
    const next: [number, number] = dragRowsRef.current ? [Math.min(dragRowsRef.current[0], row), Math.max(dragRowsRef.current[1], row)] : [row, row];
    dragRowsRef.current = next;
    setDragRows(next);
  }

  useEffect(() => {
    function finish(cancel = false) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (!cancel && dragDateRef.current && dragActionRef.current && dragRowsRef.current) {
        const start = minutesToTime(dragRowsRef.current[0] * 30);
        const end = minutesToTime((dragRowsRef.current[1] + 1) * 30);
        onDragCommit(dragDateRef.current, start, end, dragActionRef.current);
      }
      dragDateRef.current = null; dragActionRef.current = null; dragRowsRef.current = null;
      setDragDate(null);
      setDragRows(null);
    }
    function move(e: PointerEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = el?.closest<HTMLElement>("[data-week-date][data-week-row]");
      if (cell?.dataset.weekDate && cell.dataset.weekRow) handleEnter(cell.dataset.weekDate, Number(cell.dataset.weekRow));
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
        setDragDate(null);
        setDragRows(null);
        dragDateRef.current = null; dragActionRef.current = null; dragRowsRef.current = null;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const memberCount = Math.max(orderedVisible.length, 1);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="min-w-[760px]">
      <div
        className="grid border-b text-center text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: `3rem repeat(7, minmax(100px, 1fr))` }}
      >
        <div />
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          return (
            <div key={dateStr} className={cn("py-2", !isEditable(dateStr) && "text-muted-foreground/60")}>
              {WEEKDAY_LABELS[day.getDay()]}
              <div>{format(day, "M/d", { locale: ja })}</div>
            </div>
          );
        })}
      </div>

      <div className="grid flex-1" style={{ gridTemplateColumns: `3rem repeat(7, minmax(100px, 1fr))` }}>
        <div className="text-right">
          {Array.from({ length: ROWS }, (_, row) => (
            <div key={row} className="h-11 pr-1 text-[10px] leading-[2.75rem] text-muted-foreground">
              {row % 4 === 0 ? `${String(row / 2).padStart(2, "0")}:00` : ""}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const editable = isEditable(dateStr);
          return (
            <div key={dateStr} className="relative flex border-l">
              {orderedVisible.map((m) => (
                <div key={m.id} className="relative" style={{ width: `${100 / memberCount}%` }}>
                  {Array.from({ length: ROWS }, (_, row) => {
                    const covered = (slotsByUserDate.get(`${m.id}|${dateStr}`) ?? []).some((s) =>
                      slotCoversRow(s, row * 30, (row + 1) * 30),
                    );
                    const isOwn = m.id === currentUserId;
                    const inPendingDrag =
                      isOwn &&
                      dragDate === dateStr &&
                      dragRows &&
                      row >= dragRows[0] &&
                      row <= dragRows[1];

                    return (
                      <div
                        key={row}
                        data-week-date={dateStr}
                        data-week-row={row}
                        onPointerDown={() => isOwn && canEdit && handleDown(dateStr, row)}
                        onPointerEnter={() => isOwn && canEdit && handleEnter(dateStr, row)}
                        className={cn(
                          "h-11 border-b border-r border-dashed border-muted-foreground/10 touch-none",
                          row % 4 === 0 && "border-t border-solid border-muted-foreground/20",
                          isOwn && editable && "cursor-pointer",
                          !editable && isOwn && "bg-muted/40",
                        )}
                        style={{
                          backgroundColor: covered ? `${m.color}` + (isOwn ? "cc" : "66") : undefined,
                          outline: inPendingDrag ? `2px solid ${m.color}` : undefined,
                          outlineOffset: -2,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
