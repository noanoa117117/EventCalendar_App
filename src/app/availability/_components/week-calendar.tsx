"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { isDateEditable, jstToday, minutesToTime, summarizeAvailabilityRanges, weekRange } from "@/lib/availability";
import { resolveTouchGesture, shouldCommitWeekGesture, type WeekGestureIntent } from "@/lib/week-gesture";
import type { Profile, Slot } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

type MobileTouch = {
  pointerId: number;
  date: string;
  row: number;
  action: "apply" | "remove";
  startY: number;
  selecting: boolean;
  scrolled: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
};

function slotCoversRow(slot: Slot, rowStartMin: number, rowEndMin: number) {
  const start = Number(slot.start_time.slice(0, 2)) * 60 + Number(slot.start_time.slice(3, 5));
  const end = slot.end_time.slice(0, 5) === "00:00" ? 1440 : Number(slot.end_time.slice(0, 2)) * 60 + Number(slot.end_time.slice(3, 5));
  return start <= rowStartMin && end >= rowEndMin;
}

export function WeekCalendar({
  cursorDate, members, visibleIds, currentUserId, slots, window: editableWindow, onDragCommit, canEdit,
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
  const [mobileDate, setMobileDate] = useState<string | null>(null);
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragRows, setDragRows] = useState<[number, number] | null>(null);
  const draggingRef = useRef(false);
  const dragDateRef = useRef<string | null>(null);
  const dragActionRef = useRef<"apply" | "remove" | null>(null);
  const dragRowsRef = useRef<[number, number] | null>(null);
  const pendingTouchRef = useRef<PendingTouch | null>(null);
  const mobileTouchRef = useRef<MobileTouch | null>(null);
  const onDragCommitRef = useRef(onDragCommit);
  const isEditable = (date: string) => isDateEditable(date, editableWindow);
  const isOwnRowCovered = (date: string, row: number) => (slotsByUserDate.get(`${currentUserId}|${date}`) ?? []).some((slot) => slotCoversRow(slot, row * 30, (row + 1) * 30));
  function beginSelection(date: string, row: number, action: "apply" | "remove") {
    draggingRef.current = true; dragDateRef.current = date; dragActionRef.current = action; dragRowsRef.current = [row, row]; setDragDate(date); setDragRows([row, row]);
  }
  function extendSelection(date: string, row: number) {
    if (!draggingRef.current || date !== dragDateRef.current) return;
    const current = dragRowsRef.current ?? [row, row]; const next: [number, number] = [Math.min(current[0], row), Math.max(current[1], row)]; dragRowsRef.current = next; setDragRows(next);
  }
  function clearMobileTouch() {
    const touch = mobileTouchRef.current;
    if (touch?.holdTimer) clearTimeout(touch.holdTimer);
    mobileTouchRef.current = null;
  }
  function clearInteraction() { clearMobileTouch(); pendingTouchRef.current = null; draggingRef.current = false; dragDateRef.current = null; dragActionRef.current = null; dragRowsRef.current = null; setDragDate(null); setDragRows(null); }
  function commitSelection() {
    if (!dragDateRef.current || !dragActionRef.current || !dragRowsRef.current) return;
    onDragCommitRef.current(dragDateRef.current, minutesToTime(dragRowsRef.current[0] * 30), minutesToTime((dragRowsRef.current[1] + 1) * 30), dragActionRef.current);
  }
  function handlePointerDown(event: React.PointerEvent<HTMLElement>, date: string, row: number) {
    if (!canEdit || !isEditable(date)) return;
    onDragCommitRef.current = onDragCommit;
    const action = isOwnRowCovered(date, row) ? "remove" : "apply";
    if (event.pointerType === "touch") {
      pendingTouchRef.current = { pointerId: event.pointerId, date, row, action, startX: event.clientX, startY: event.clientY, intent: "pending" }; return;
    }
    beginSelection(date, row, action);
  }

  function handleMobilePointerDown(event: React.PointerEvent<HTMLButtonElement>, date: string, row: number) {
    if (!canEdit || !isEditable(date)) return;
    onDragCommitRef.current = onDragCommit;
    const action = isOwnRowCovered(date, row) ? "remove" : "apply";
    if (event.pointerType !== "touch") {
      beginSelection(date, row, action);
      return;
    }
    const touch: MobileTouch = {
      pointerId: event.pointerId,
      date,
      row,
      action,
      startY: event.clientY,
      selecting: false,
      scrolled: false,
      holdTimer: null,
    };
    touch.holdTimer = setTimeout(() => {
      if (mobileTouchRef.current !== touch || touch.scrolled) return;
      touch.selecting = true;
      beginSelection(date, row, action);
    }, 350);
    mobileTouchRef.current = touch;
  }

  function handleMobilePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const touch = mobileTouchRef.current;
    if (!touch || touch.pointerId !== event.pointerId || touch.selecting) return;
    if (Math.abs(event.clientY - touch.startY) > 8) {
      touch.scrolled = true;
      if (touch.holdTimer) clearTimeout(touch.holdTimer);
      touch.holdTimer = null;
    }
  }

  function handleMobilePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const touch = mobileTouchRef.current;
    if (!touch || touch.pointerId !== event.pointerId) return;
    if (touch.holdTimer) clearTimeout(touch.holdTimer);
    touch.holdTimer = null;
    if (touch.scrolled) {
      mobileTouchRef.current = null;
      return;
    }
    if (!touch.selecting) {
      onDragCommitRef.current(touch.date, minutesToTime(touch.row * 30), minutesToTime((touch.row + 1) * 30), touch.action);
      mobileTouchRef.current = null;
    }
    // A deliberate long-press selection is committed by the shared window
    // pointerup listener below, preserving the desktop draft state machine.
  }

  // The window listeners deliberately mount once; pointer-down refreshes the
  // commit callback ref so a newly-entered edit mode is never stale.
  useEffect(() => {
    function move(event: PointerEvent) {
      const touch = pendingTouchRef.current;
      if (touch?.pointerId === event.pointerId) {
        const intent = resolveTouchGesture({ clientX: touch.startX, clientY: touch.startY }, event);
        if (intent === "scroll") { touch.intent = "scroll"; return; }
        if (intent === "select" && touch.intent !== "select") { touch.intent = "select"; beginSelection(touch.date, touch.row, touch.action); }
        if (touch.intent !== "select") return;
      }
      if (!draggingRef.current) return;
      event.preventDefault();
      const cell = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-week-date][data-week-row]");
      if (cell?.dataset.weekDate && cell.dataset.weekRow) extendSelection(cell.dataset.weekDate, Number(cell.dataset.weekRow));
    }
    function finish(event: PointerEvent) {
      const touch = pendingTouchRef.current;
      if (touch?.pointerId === event.pointerId && touch.intent === "pending") { onDragCommitRef.current(touch.date, minutesToTime(touch.row * 30), minutesToTime((touch.row + 1) * 30), touch.action); clearInteraction(); return; }
      if (touch?.pointerId === event.pointerId && !shouldCommitWeekGesture(touch.intent)) { clearInteraction(); return; }
      if (draggingRef.current) commitSelection(); clearInteraction();
    }
    const cancel = () => clearInteraction();
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") clearInteraction(); }; window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel); }, []);

  const isDragging = dragDate !== null;
  const mobileDay = mobileDate ? days.find((day) => format(day, "yyyy-MM-dd") === mobileDate) : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain @3xl:hidden">
        <div className="divide-y">
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const editable = canEdit && isEditable(date);
            const summaries = orderedVisible.map((member) => ({
              member,
              ranges: summarizeAvailabilityRanges(slotsByUserDate.get(`${member.id}|${date}`) ?? []),
            }));
            const content = <>
              <div className="mb-1 flex min-h-6 items-center gap-2">
                <span className="text-sm font-semibold">{format(day, "M/d")}</span>
                <span className="text-xs text-muted-foreground">{WEEKDAY_LABELS[day.getDay()]}</span>
                {date === today && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">今日</span>}
                {editable && <span className="ml-auto text-xs text-muted-foreground">編集</span>}
              </div>
              <div className="space-y-1">
                {summaries.length > 0 ? summaries.map(({ member, ranges }) => <div key={member.id} className="flex min-w-0 items-start gap-2 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: member.color }} aria-hidden="true" />
                  <span className="shrink-0 text-xs font-medium">{member.id === currentUserId ? "自分" : member.nickname}</span>
                  <span className="min-w-0 text-muted-foreground">{ranges.length ? ranges.map((range) => `${range.start}〜${range.end}`).join("、") : "空き時間未登録"}</span>
                </div>) : <p className="text-xs text-muted-foreground">空き時間未登録</p>}
              </div>
            </>;
            return editable
              ? <button type="button" key={date} onClick={() => setMobileDate(date)} className="block min-h-16 w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</button>
              : <div key={date} className="min-h-16 px-3 py-2.5" aria-label={`${format(day, "M月d日", { locale: ja })}は編集できません`}>{content}</div>;
          })}
        </div>
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto @3xl:block">
        <div className="grid min-w-[44rem] grid-cols-[3rem_repeat(7,minmax(4.5rem,1fr))] grid-rows-[auto_repeat(48,var(--row-h))] grid-rules">
          <div className="sticky top-0 z-10 bg-card" />
          {days.map((day) => { const date = format(day, "yyyy-MM-dd"); return <div key={date} className={cn("sticky top-0 z-10 bg-card py-2 text-center text-xs font-medium text-muted-foreground", date === today && "text-today", !isEditable(date) && "text-muted-foreground/60")}>{WEEKDAY_LABELS[day.getDay()]}<div>{format(day, "M/d")}</div></div>; })}
          {Array.from({ length: ROWS }, (_, row) => <div key={`time-${row}`} className="pr-1 text-right text-xs leading-[var(--row-h)] text-muted-foreground" style={{ gridColumn: 1, gridRow: row + 2 }}>{row % 4 === 0 ? `${String(row / 2).padStart(2, "0")}:00` : ""}</div>)}
          {/* Desktop cells only invoke refs after a user pointer interaction. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {Array.from({ length: ROWS }, (_, row) => days.map((day, dayIndex) => { const date = format(day, "yyyy-MM-dd"); const editable = isEditable(date); const covered = orderedVisible.filter((member) => (slotsByUserDate.get(`${member.id}|${date}`) ?? []).some((slot) => slotCoversRow(slot, row * 30, (row + 1) * 30))); const allCovered = orderedVisible.length > 0 && covered.length === orderedVisible.length; const ownCovered = covered.some((member) => member.id === currentUserId); const pending = dragDate === date && dragRows && row >= dragRows[0] && row <= dragRows[1]; const gradient = covered.map((member, index) => `${member.color} ${Math.round(index / covered.length * 100)}% ${Math.round((index + 1) / covered.length * 100)}%`).join(", "); return <div key={`${date}-${row}`} data-week-date={date} data-week-row={row} onPointerDown={(event) => handlePointerDown(event, date, row)} onPointerEnter={(event) => event.pointerType !== "touch" && extendSelection(date, row)} title={covered.map((member) => member.id === currentUserId ? "自分" : member.nickname).join("、")} className={cn("relative touch-pan-x border-b border-dashed border-muted-foreground/10", isDragging && "touch-none", row % 4 === 0 && "border-t border-solid border-muted-foreground/20", editable && canEdit && "cursor-pointer", !editable && "bg-muted/40", allCovered && "overlap-block")} style={{ gridColumn: dayIndex + 2, gridRow: row + 2, backgroundImage: !allCovered && covered.length > 0 ? `linear-gradient(90deg, ${gradient})` : undefined, opacity: !allCovered && covered.length > 0 ? ownCovered ? 0.82 : 0.5 : undefined, outline: pending ? "2px solid var(--warning)" : undefined, outlineOffset: -2 }} />; }))}
        </div>
      </div>
      <Dialog open={mobileDate !== null} onOpenChange={(open) => !open && setMobileDate(null)}>
        <DialogContent showCloseButton={false} className="top-auto bottom-0 max-h-[90dvh] max-w-none translate-y-0 gap-3 rounded-b-none rounded-t-xl p-0 @3xl:hidden" aria-label="日別の空き時間を編集">
          <DialogHeader className="border-b px-4 pt-5 pr-14">
            <DialogTitle>{mobileDay && format(mobileDay, "M月d日（EEEE）", { locale: ja })}の空き時間</DialogTitle>
            <DialogDescription>タップで1枠を変更します。長押ししてから縦にドラッグすると連続した枠を変更できます。</DialogDescription>
          </DialogHeader>
          <button type="button" onClick={() => setMobileDate(null)} aria-label="閉じる" className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-md text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">閉じる</button>
          <div className={cn("max-h-[65dvh] overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]", isDragging && "touch-none")}>
            <div className="divide-y rounded-lg border">
              {Array.from({ length: ROWS }, (_, row) => {
                const covered = mobileDate ? isOwnRowCovered(mobileDate, row) : false;
                const pending = dragDate === mobileDate && dragRows && row >= dragRows[0] && row <= dragRows[1];
                return <button
                  type="button"
                  key={row}
                  data-week-date={mobileDate ?? undefined}
                  data-week-row={row}
                  onPointerDown={(event) => mobileDate && handleMobilePointerDown(event, mobileDate, row)}
                  onPointerMove={handleMobilePointerMove}
                  onPointerUp={handleMobilePointerUp}
                  onPointerCancel={clearInteraction}
                  onPointerEnter={(event) => event.pointerType !== "touch" && mobileDate && extendSelection(mobileDate, row)}
                  onClick={(event) => {
                    if (event.detail === 0 && mobileDate) {
                      const action = isOwnRowCovered(mobileDate, row) ? "remove" : "apply";
                      onDragCommit(mobileDate, minutesToTime(row * 30), minutesToTime((row + 1) * 30), action);
                    }
                  }}
                  aria-pressed={covered}
                  aria-label={`${minutesToTime(row * 30)} ${covered ? "選択済み" : "未選択"}`}
                  disabled={!canEdit || !mobileDate || !isEditable(mobileDate)}
                  className={cn("flex min-h-11 w-full items-center justify-between px-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", covered && "bg-primary/10 font-medium", pending && "bg-warning-soft ring-2 ring-inset ring-warning")}
                ><span>{minutesToTime(row * 30)}</span><span className="text-xs text-muted-foreground">{covered ? "登録済み" : "未登録"}</span></button>;
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
