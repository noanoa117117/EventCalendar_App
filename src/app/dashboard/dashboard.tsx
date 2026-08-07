"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { addDevEvent } from "@/lib/dev-auth";
import { expandToSlots, minutesToTime, jstToday, type TimeRange } from "@/lib/availability";
import type { Database } from "@/lib/database.types";
import type { Preset, Profile, Slot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AvailabilityBoard } from "@/app/availability/_components/availability-board";
import { EventCalendar } from "@/app/events/event-calendar";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Participant = Database["public"]["Tables"]["event_participants"]["Row"];
type Pane = "planning" | "events" | "availability";

export function Dashboard({ currentUser, members, slots, presets, events, participants, preview = false }: { currentUser: Profile; members: Profile[]; slots: Slot[]; presets: Preset[]; events: Event[]; participants: Participant[]; preview?: boolean }) {
  const [active, setActive] = useState<Pane>("planning");
  const [isMobile, setIsMobile] = useState(true);
  useEffect(() => { const media = window.matchMedia("(max-width: 767px)"); const update = () => setIsMobile(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const [dashboardEvents, setDashboardEvents] = useState(events);
  const [dashboardSlots, setDashboardSlots] = useState(slots);
  const onCreated = (event: Event) => setDashboardEvents((old) => old.some((item) => item.id === event.id) ? old : [...old, event].sort((a, b) => a.start_at.localeCompare(b.start_at)));
  const refreshSlots = async (previewSlots?: Slot[]) => { if (preview) { if (previewSlots) setDashboardSlots(previewSlots); return; } const { data } = await createClient().from("availability_slots").select("*").in("user_id", members.map((member) => member.id)); if (data) setDashboardSlots(data); };
  const panes = {
    planning: <CompactPlanning currentUser={currentUser} members={members} initialSlots={dashboardSlots} preview={preview} onCreated={onCreated} />,
    events: <EventCalendar key={dashboardEvents.map((event) => event.id).join(":")} currentUser={currentUser} initialEvents={dashboardEvents} initialParticipants={participants} people={members} preview={preview} compact />,
    availability: <AvailabilityBoard currentUser={currentUser} members={members} initialPresets={presets} initialSlots={dashboardSlots} preview={preview} compact onAvailabilityChanged={refreshSlots} />,
  };
  return <main className="min-h-dvh bg-muted/20 pb-16 md:pb-0"><div className="grid min-h-dvh grid-cols-1 gap-3 p-3 md:grid-cols-3 md:overflow-hidden"><section className={`${active === "planning" ? "" : "hidden md:block"} min-h-0 overflow-y-auto rounded-xl border bg-background`}><h1 className="sticky top-0 z-10 border-b bg-background px-4 py-3 text-lg font-semibold">企画</h1>{(!isMobile || active === "planning") && panes.planning}</section><section className={`${active === "events" ? "" : "hidden md:block"} min-h-0 overflow-y-auto rounded-xl border bg-background`}><h1 className="sticky top-0 z-10 border-b bg-background px-4 py-3 text-lg font-semibold">イベント</h1>{(!isMobile || active === "events") && panes.events}</section><section className={`${active === "availability" ? "" : "hidden md:block"} min-h-0 overflow-y-auto rounded-xl border bg-background`}><h1 className="sticky top-0 z-10 border-b bg-background px-4 py-3 text-lg font-semibold">空き時間</h1>{(!isMobile || active === "availability") && panes.availability}</section></div><nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden">{([['planning','企画'],['events','イベント'],['availability','空き時間']] as const).map(([id,label]) => <button key={id} className={`py-3 text-sm ${active === id ? "font-semibold text-primary" : "text-muted-foreground"}`} onClick={() => setActive(id)}>{label}</button>)}</nav></main>;
}

function CompactPlanning({ currentUser, members, initialSlots, preview, onCreated }: { currentUser: Profile; members: Profile[]; initialSlots: Slot[]; preview: boolean; onCreated: (event: Event) => void }) {
  const [selected, setSelected] = useState(() => new Set([currentUser.id]));
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState(initialSlots);
  const request = useRef(0);
  const week = useMemo(() => startOfWeek(new Date(`${jstToday()}T12:00:00`), { weekStartsOn: 1 }), []);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => format(addDays(week, i), "yyyy-MM-dd")), [week]);
  useEffect(() => {
    if (preview) return;
    const generation = ++request.current;
    createClient().from("availability_slots").select("*").in("user_id", [...selected]).gte("date", dates[0]).lte("date", dates[6]).then(({ data }) => { if (generation === request.current) setSlots(data ?? []); });
  }, [dates, initialSlots, preview, request, selected]);
  const availableSlots = preview ? initialSlots : slots;
  const candidates = useMemo(() => {
    const out: { date: string; start: number }[] = [];
    for (const date of dates) for (let minute = 0; minute < 1440; minute += 30) {
      if (!selected.size || selected.size !== members.filter((m) => selected.has(m.id)).length) continue;
      const ok = [...selected].every((id) => { const ranges: TimeRange[] = availableSlots.filter((s) => s.user_id === id && s.date === date).map((s) => ({ start_time: s.start_time, end_time: s.end_time })); return new Set(expandToSlots(ranges)).has(minutesToTime(minute)); });
      if (ok && minute + duration <= 1440) { const continuous = Array.from({ length: duration / 30 }, (_, i) => minutesToTime(minute + i * 30)); if ([...selected].every((id) => { const ranges: TimeRange[] = availableSlots.filter((s) => s.user_id === id && s.date === date).map((s) => ({ start_time: s.start_time, end_time: s.end_time })); const set = new Set(expandToSlots(ranges)); return continuous.every((t) => set.has(t)); })) out.push({ date, start: minute }); }
    }
    return out.slice(0, 30);
  }, [availableSlots, dates, duration, members, selected]);
  const [picked, setPicked] = useState<{ date: string; start: number } | null>(null);
  async function create() { if (!picked || !title.trim()) return toast.error("候補とタイトルを選択してください。"); const start = new Date(`${picked.date}T${minutesToTime(picked.start)}:00+09:00`); const end = new Date(start.getTime() + duration * 60000); const payload = { title: title.trim(), description: null, start_at: start.toISOString(), end_at: end.toISOString(), created_by: currentUser.id, status: "published" as const }; if (preview) { const event = addDevEvent(payload); localStorage.setItem("eventcalendar-dev-events", JSON.stringify([...JSON.parse(localStorage.getItem("eventcalendar-dev-events") ?? "[]"), event])); onCreated(event); toast.success("イベントを作成しました（ローカル）。"); return; } const { data, error } = await createClient().from("events").insert(payload).select().single(); if (error || !data) return toast.error("イベントの作成に失敗しました。"); onCreated(data); toast.success("イベントを作成しました。"); }
  return <div className="space-y-4 p-4"><p className="text-xs text-muted-foreground">JST・全員共通の空き時間（30分単位）</p><div className="space-y-2">{members.map((m) => <label key={m.id} className="mr-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={selected.has(m.id)} onChange={() => setSelected((old) => { const n = new Set(old); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })} />{m.nickname}</label>)}</div><div className="flex gap-1">{[30,60,90,120].map((d) => <Button key={d} size="sm" variant={duration === d ? "default" : "outline"} onClick={() => setDuration(d)}> {d}分 </Button>)}</div><div className="max-h-72 space-y-1 overflow-y-auto">{candidates.length ? candidates.map((c) => <button key={`${c.date}-${c.start}`} onClick={() => setPicked(c)} className={`block w-full rounded border p-2 text-left text-sm ${picked?.date === c.date && picked.start === c.start ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>{format(new Date(`${c.date}T12:00:00`), "M月d日（EEE）", { locale: ja })} {minutesToTime(c.start)}〜{minutesToTime(c.start + duration)}</button>) : <p className="text-sm text-muted-foreground">共通候補がありません。</p>}</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="イベントタイトル" className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" /><Button className="w-full" disabled={!picked || !title.trim()} onClick={create}>イベントを作成</Button></div>;
}
