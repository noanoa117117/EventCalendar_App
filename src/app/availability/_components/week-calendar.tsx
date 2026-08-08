"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { isDateEditable, jstToday, minutesToTime, weekRange } from "@/lib/availability";
import { resolveTouchGesture, shouldCommitWeekGesture, type WeekGestureIntent } from "@/lib/week-gesture";
import type { Profile, Slot } from "@/lib/types";

const ROWS = 48;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type PendingTouch = {
  pointerId: number;
  date: string;
  row: number;
  action: "apply" | "remove";
  startX: number;
  startY: number;
  intent: WeekGestureIntent;
};

function slotCoversRow(slot: Slot, rowStartMin: number, rowEndMin: number) {
  const start = Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5));
  const end = slot.end_time.slice(0, 5) === "00:00"
    ? 1440
    : Number(slot.end_time.slice(0, 2)) * 60 + Number(slot.end_time.slice(3, 5));
  return start <= rowStartMin && end >= rowEndMin;
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
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const today = jstToday();
  const orderedVisible = useMemo(() => {
    const list = members.filter((member) => visibleIds.has(member.id));
    list.sort((a, b) => a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : a.nickname.localeCompare(b.nickname));
    return list;
  }, [members, visibleIds, currentUserId]);
  const slotsByUserDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = `${slot.user_id}|${slot.date}`;
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return map;
  }, [slots]);
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragRows, setDragRows] = useState<[number, number] | null>(null);
  const draggingRef = useRef(false);
  const dragDateRef = useRef<string | null>(null);
  const dragActionRef = useRef<"apply" | "remove" | null>(null);
  const dragRowsRef = useRef<[number, number] | null>(null);
  const pendingTouchRef = useRef<PendingTouch | null>(null);
  const onDragCommitRef = useRef(onDragCommit);

  function isEditable(date: string) {
    return isDateEditable(date, editableWindow);
  }

  function isOwnRowCovered(date: string, row: number) {
    return (slotsByUserDate.get(`${currentUserId}|${date}`) ?? []).some((slot) => slotCoversRow(slot, row * 30, (row + 1) * 30));
  }

  function beginSelection(date: string, row: number, action: "apply" | "remove") {
    draggingRef.current = true;
    dragDateRef.current = date;
    dragActionRef.current = action;
    dragRowsRef.current = [row, row];
    setDragDate(date);
    setDragRows([row, row]);
  }

  function extendSelection(date: string, row: number) {
    if (!draggingRef.current || date !== dragDateRef.current) return;
    const current = dragRowsRef.current ?? [row, row];
    const next: [number, number] = [Math.min(current[0], row), Math.max(current[1], row)];
    dragRowsRef.current = next;
    setDragRows(next);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>, date: string, row: number) {
    if (!canEdit || !isEditable(date)) return;
    // Global pointer listeners are mounted once. Capture the current callback
    // at the user action, not the initial render where edit mode is false.
    onDragCommitRef.current = onDragCommit;
    const action = isOwnRowCovered(date, row) ? "remove" : "apply";
    if (event.pointerType === "touch") {
      pendingTouchRef.current = {
        pointerId: event.pointerId,
        date,
        row,
        action,
        startX: event.clientX,
        startY: event.clientY,
        intent: "pending",
      };
      return;
    }
    beginSelection(date, row, action);
  }

  function clearInteraction() {
    pendingTouchRef.current = null;
    draggingRef.current = false;
    dragDateRef.current = null;
    dragActionRef.current = null;
    dragRowsRef.current = null;
    setDragDate(null);
    setDragRows(null);
  }

  function commitSelection() {
    if (!dragDateRef.current || !dragActionRef.current || !dragRowsRef.current) return;
    onDragCommitRef.current(
      dragDateRef.current,
      minutesToTime(dragRowsRef.current[0] * 30),
      minutesToTime((dragRowsRef.current[1] + 1) * 30),
      dragActionRef.current,
    );
  }

  useEffect(() => {
    function move(event: PointerEvent) {
      const touch = pendingTouchRef.current;
      if (touch?.pointerId === event.pointerId) {
        const intent = resolveTouchGesture({ clientX: touch.startX, clientY: touch.startY }, event);
        if (intent === "scroll") {
          touch.intent = "scroll";
          return;
        }
        if (intent === "select" && touch.intent !== "select") {
          touch.intent = "select";
          beginSelection(touch.date, touch.row, touch.action);
        }
        if (touch.intent !== "select") return;
      }
      if (!draggingRef.current) return;
      event.preventDefault();
      const cell = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-date][data-week-row]");
      if (cell?.dataset.weekDate && cell.dataset.weekRow) extendSelection(cell.dataset.weekDate, Number(cell.dataset.weekRow));
    }

    function finish(event: PointerEvent) {
      const touch = pendingTouchRef.current;
      if (touch?.pointerId === event.pointerId && touch.intent === "pending") {
        onDragCommitRef.current(touch.date, minutesToTime(touch.row * 30), minutesToTime((touch.row + 1) * 30), touch.action);
        clearInteraction();
        return;
      }
      if (touch?.pointerId === event.pointerId && !shouldCommitWeekGesture(touch.intent)) {
        clearInteraction();
        return;
      }
      if (draggingRef.current) commitSelection();
      clearInteraction();
    }

    function cancel() {
      // A cancelled touch belongs to a browser scroll or interrupted gesture;
      // it must never write a draft availability operation.
      clearInteraction();
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);

  const isDragging = dragDate !== null;

  useEffect(() => {
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") clearInteraction();
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b px-3 py-1 text-xs text-muted-foreground @lg:hidden" aria-live="polite">
        ← 横にスワイプして曜日を移動。編集中は縦にドラッグして時間を選択できます。
      </p>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="grid min-w-[44rem] grid-cols-[3rem_repeat(7,minmax(4.5rem,1fr))] grid-rows-[auto_repeat(48,var(--row-h))] grid-rules">
          <div className="sticky top-0 z-10 bg-card" />
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            return (
              <div key={date} className={cn("sticky top-0 z-10 bg-card py-2 text-center text-xs font-medium text-muted-foreground", date === today && "text-today", !isEditable(date) && "text-muted-foreground/60")}>
                {WEEKDAY_LABELS[day.getDay()]}
                <div>{format(day, "M/d")}</div>
              </div>
            );
          })}
          {Array.from({ length: ROWS }, (_, row) => (
            <div key={`time-${row}`} className="pr-1 text-right text-xs leading-[var(--row-h)] text-muted-foreground" style={{ gridColumn: 1, gridRow: row + 2 }}>
              {row % 4 === 0 ? `${String(row / 2).padStart(2, "0")}:00` : ""}
            </div>
          ))}
          {/* Pointer handlers below access refs only after user interaction. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {Array.from({ length: ROWS }, (_, row) => days.map((day, dayIndex) => {
            const date = format(day, "yyyy-MM-dd");
            const editable = isEditable(date);
            const covered = orderedVisible.filter((member) => (slotsByUserDate.get(`${member.id}|${date}`) ?? []).some((slot) => slotCoversRow(slot, row * 30, (row + 1) * 30)));
            const allCovered = orderedVisible.length > 0 && covered.length === orderedVisible.length;
            const ownCovered = covered.some((member) => member.id === currentUserId);
            const pending = dragDate === date && dragRows && row >= dragRows[0] && row <= dragRows[1];
            const gradient = covered.map((member, index) => `${member.color} ${Math.round(index / covered.length * 100)}% ${Math.round((index + 1) / covered.length * 100)}%`).join(", ");
            const memberLabel = covered.map((member) => member.id === currentUserId ? "自分" : member.nickname).join("、");

            return (
              <div
                key={`${date}-${row}`}
                data-week-date={date}
                data-week-row={row}
                onPointerDown={(event) => handlePointerDown(event, date, row)}
                onPointerEnter={(event) => event.pointerType !== "touch" && extendSelection(date, row)}
                title={memberLabel ? `${minutesToTime(row * 30)}–${minutesToTime((row + 1) * 30)}: ${memberLabel}` : undefined}
                className={cn("relative touch-pan-x border-b border-dashed border-muted-foreground/10", isDragging && "touch-none", row % 4 === 0 && "border-t border-solid border-muted-foreground/20", editable && canEdit && "cursor-pointer", !editable && "bg-muted/40", allCovered && "overlap-block")}
                style={{
                  gridColumn: dayIndex + 2,
                  gridRow: row + 2,
                  backgroundImage: !allCovered && covered.length > 0 ? `linear-gradient(90deg, ${gradient})` : undefined,
                  opacity: !allCovered && covered.length > 0 ? ownCovered ? 0.82 : 0.5 : undefined,
                  outline: pending ? "2px solid var(--warning)" : undefined,
                  outlineOffset: -2,
                }}
              />
            );
          }))}
        </div>
      </div>
    </div>
  );
}
