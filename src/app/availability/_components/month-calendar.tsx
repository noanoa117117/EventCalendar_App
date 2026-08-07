"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatTimeLabel, isDateEditable, isRangeCovered, monthGridRange } from "@/lib/availability";
import type { Preset, Profile, Slot } from "@/lib/types";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function MonthCalendar({
  cursorDate,
  members,
  visibleIds,
  currentUserId,
  slots,
  activePreset,
  presets,
  window: editableWindow,
  onPaint,
  canEdit,
}: {
  cursorDate: Date;
  members: Profile[];
  visibleIds: Set<string>;
  currentUserId: string;
  slots: Slot[];
  activePreset: Preset | null;
  presets: Preset[];
  window: { min: string; max: string };
  onPaint: (dates: string[], action: "apply" | "remove", preset: Preset) => void;
  canEdit: boolean;
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
          const visibleSlots = dotMembers.flatMap((m) =>
            (slotsByUserDate.get(`${m.id}|${dateStr}`) ?? []).map((slot) => ({ member: m, slot })),
          );
          const prioritizedSlots = [
            ...visibleSlots.filter(({ member }) => member.id === currentUserId),
            ...visibleSlots.filter(({ member }) => member.id !== currentUserId),
          ];
          const chips = prioritizedSlots.slice(0, 2);

          return (
            <div
              key={dateStr}
              data-date={dateStr}
              onPointerDown={(e) => handlePointerDown(dateStr, e)}
              onPointerEnter={() => handlePointerEnter(dateStr)}
              className={cn(
                "flex select-none flex-col gap-1 border-b border-r p-1.5 text-left align-top",
                !inMonth && "bg-muted/30",
                editable && canEdit && activePreset && "cursor-pointer",
                !editable && "bg-muted/50",
                dragging && "touch-none",
              )}
              style={{ touchAction: canEdit && activePreset && editable ? "none" : "auto", outline: canEdit && (isVisitedNow || applied) ? `2px solid ${activePreset?.color ?? "#888"}` : undefined, outlineOffset: -2 }}
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
                {chips.map(({ member: m, slot }) => {
                  const ownPreset = m.id === currentUserId ? presets.find((p) => p.id === slot.preset_id) : undefined;
                  const isDraft = slot.id.startsWith("draft-");
                  const timeLabel = `${formatTimeLabel(slot.start_time)}–${formatTimeLabel(slot.end_time, true)}`;
                  const visibleLabel = m.id === currentUserId
                    ? `${isDraft ? "未確定 " : ""}${timeLabel}`
                    : `${m.nickname} ${timeLabel}`;
                  const titleLabel = m.id === currentUserId
                    ? `${isDraft ? "未確定 " : ""}${ownPreset?.label ?? "空き"} ${timeLabel}`
                    : visibleLabel;
                  return <span key={`${m.id}-${slot.id}`} className={cn("max-w-full truncate rounded border px-1 text-[10px] leading-4", isDraft && "border-dashed opacity-75")} style={{ borderColor: ownPreset?.color ?? (m.id === currentUserId ? "#a3a3a3" : m.color) }} title={titleLabel}>{visibleLabel}</span>;
                })}
                {prioritizedSlots.length > chips.length && <span className="text-[10px] text-muted-foreground">+{prioritizedSlots.length - chips.length}</span>}
              </div>
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
