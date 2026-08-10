"use client";

import { useEffect, useRef, useState } from "react";
import type { Preset } from "@/lib/types";

export function useDragPaint({ canEdit, activePreset, onPaint, isEditable, isApplied, selector = "[data-date]" }: {
  canEdit: boolean;
  activePreset: Preset | null;
  onPaint: (dates: string[], action: "apply" | "remove", preset: Preset) => void;
  isEditable: (date: string) => boolean;
  isApplied: (date: string) => boolean;
  selector?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const activeRef = useRef(activePreset);
  const paintRef = useRef(onPaint);
  const draggingRef = useRef(false);
  const visitedRef = useRef(new Set<string>());
  const actionRef = useRef<"apply" | "remove" | null>(null);
  useEffect(() => { activeRef.current = activePreset; paintRef.current = onPaint; }, [activePreset, onPaint]);

  function finish(cancel = false) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (!cancel && activeRef.current && actionRef.current && visitedRef.current.size) paintRef.current(Array.from(visitedRef.current), actionRef.current, activeRef.current);
    visitedRef.current = new Set();
    setVisited(new Set());
  }
  useEffect(() => {
    function move(event: PointerEvent) {
      if (!draggingRef.current) return;
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const date = element?.closest<HTMLElement>(selector)?.dataset.date ?? element?.closest<HTMLElement>(selector)?.dataset.weekDate;
      if (!date || !activeRef.current || !isEditable(date) || visitedRef.current.has(date)) return;
      visitedRef.current = new Set(visitedRef.current).add(date);
      setVisited(new Set(visitedRef.current));
    }
    const up = () => finish();
    const cancel = () => finish(true);
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("pointermove", move, { passive: false });
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("pointermove", move); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && draggingRef.current) finish(true); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  function onPointerDown(date: string, event?: React.PointerEvent) {
    if (!canEdit || !activePreset || !isEditable(date)) return;
    event?.preventDefault(); draggingRef.current = true; setDragging(true);
    actionRef.current = isApplied(date) ? "remove" : "apply";
    visitedRef.current = new Set([date]); setVisited(new Set([date]));
  }
  function onPointerEnter(date: string) {
    if (!canEdit || !draggingRef.current || !activeRef.current || !isEditable(date) || visitedRef.current.has(date)) return;
    visitedRef.current = new Set(visitedRef.current).add(date); setVisited(new Set(visitedRef.current));
  }
  return { dragging, visited, draggingRef, onPointerDown, onPointerEnter };
}
