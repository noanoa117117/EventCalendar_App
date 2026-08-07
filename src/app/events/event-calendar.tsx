"use client";

import { useEffect, useMemo, useState } from "react";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ja } from "date-fns/locale";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { CalendarDays, ChevronLeft, ChevronRight, CircleX, Pencil, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database, EventParticipantStatus, EventStatus } from "@/lib/database.types";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignOutButton } from "@/components/sign-out-button";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Participant = Database["public"]["Tables"]["event_participants"]["Row"];
type View = "month" | "week";
type Panel = { kind: "none" } | { kind: "detail"; event: Event } | { kind: "form"; event: Event | null };

const jst = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
const time = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const JST = "Asia/Tokyo";
const asJstCalendarDate = (value: Date | string) => toZonedTime(typeof value === "string" ? new Date(value) : value, JST);
const statusLabel: Record<EventParticipantStatus, string> = { going: "参加", maybe: "未定", declined: "不参加" };

export function EventCalendar({ currentUser, initialEvents, initialParticipants, people, preview = false, compact = false }: { currentUser: Profile; initialEvents: Event[]; initialParticipants: Participant[]; people: Profile[]; preview?: boolean; compact?: boolean }) {
  const [events, setEvents] = useState(initialEvents);
  const [participants, setParticipants] = useState(initialParticipants);
  // Keep date-fns' calendar arithmetic based on JST-shaped calendar dates so
  // the grid does not shift when a user views it from another time zone.
  const [cursor, setCursor] = useState(() => asJstCalendarDate(new Date()));
  const [view, setView] = useState<View>("month");
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const names = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const days = view === "month"
    ? eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) })
    : eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) });
  const selected = panel.kind === "detail" ? panel.event : null;
  const selectedParticipants = selected ? participants.filter((p) => p.event_id === selected.id) : [];

  useEffect(() => {
    if (!preview) return;
    try {
      const local = JSON.parse(window.localStorage.getItem("eventcalendar-dev-events") ?? "[]") as Event[];
      // Local preview persistence is an external browser storage subscription.
      if (local.length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEvents((old) => [...old, ...local.filter((event) => !old.some((item) => item.id === event.id))]);
      }
    } catch { /* ignore malformed local preview data */ }
  }, [preview]);

  async function respond(status: EventParticipantStatus) {
    if (!selected) return;
    if (preview) {
      const data: Participant = { event_id: selected.id, user_id: currentUser.id, status, comment: null, updated_at: new Date().toISOString() };
      setParticipants((old) => [...old.filter((p) => !(p.event_id === data.event_id && p.user_id === data.user_id)), data]);
      toast.success("参加表明を更新しました（ローカル）。");
      return;
    }
    const client = createClient();
    const row = { event_id: selected.id, user_id: currentUser.id, status, comment: null };
    const { data, error } = await client.from("event_participants").upsert(row, { onConflict: "event_id,user_id" }).select().single();
    if (error || !data) { toast.error("参加表明の更新に失敗しました。"); return; }
    setParticipants((old) => [...old.filter((p) => !(p.event_id === data.event_id && p.user_id === data.user_id)), data]);
    toast.success("参加表明を更新しました。");
  }

  async function saveEvent(form: FormData) {
    const title = String(form.get("title") ?? "").trim();
    const start = String(form.get("start") ?? "");
    const end = String(form.get("end") ?? "");
    if (!title || !start || !end || new Date(start).getTime() >= new Date(end).getTime()) { toast.error("タイトルと正しい日時を入力してください。"); return; }
    // datetime-local has no timezone; event forms are explicitly JST.
    const editing = panel.kind === "form" ? panel.event : null;
    const payload = { title, description: String(form.get("description") ?? "").trim() || null, start_at: new Date(`${start}:00+09:00`).toISOString(), end_at: new Date(`${end}:00+09:00`).toISOString() };
    if (preview) {
      const data: Event = editing
        ? { ...editing, ...payload }
        : { id: crypto.randomUUID(), ...payload, created_by: currentUser.id, status: "published", created_at: new Date().toISOString() };
      setEvents((old) => editing ? old.map((e) => e.id === data.id ? data : e) : [...old, data].sort((a, b) => a.start_at.localeCompare(b.start_at)));
      setPanel({ kind: "detail", event: data }); toast.success(editing ? "イベントを更新しました（ローカル）。" : "イベントを作成しました（ローカル）。");
      return;
    }
    const client = createClient();
    const result = editing
      ? await client.from("events").update(payload).eq("id", editing.id).select().single()
      : await client.from("events").insert({ ...payload, created_by: currentUser.id, status: "published" as EventStatus }).select().single();
    if (result.error || !result.data) { toast.error("イベントの保存に失敗しました。"); return; }
    setEvents((old) => editing ? old.map((e) => e.id === result.data.id ? result.data : e) : [...old, result.data].sort((a, b) => a.start_at.localeCompare(b.start_at)));
    setPanel({ kind: "detail", event: result.data }); toast.success(editing ? "イベントを更新しました。" : "イベントを作成しました。");
  }

  async function cancelEvent(event: Event) {
    if (!window.confirm("このイベントをキャンセルしますか？")) return;
    if (preview) {
      const data = { ...event, status: "cancelled" as EventStatus };
      setEvents((old) => old.map((e) => e.id === data.id ? data : e)); setPanel({ kind: "detail", event: data });
      toast.success("イベントをキャンセルしました（ローカル）。");
      return;
    }
    const { data, error } = await createClient().from("events").update({ status: "cancelled" }).eq("id", event.id).eq("created_by", currentUser.id).select().single();
    if (error || !data) { toast.error("キャンセルに失敗しました。"); return; }
    setEvents((old) => old.map((e) => e.id === data.id ? data : e)); setPanel({ kind: "detail", event: data });
  }

  return <main className={`${compact ? "min-h-0" : "min-h-dvh"} bg-muted/20`}>
    {!compact && <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 md:px-8">
      <div className="flex items-center gap-2"><CalendarDays className="size-5" /><h1 className="text-lg font-semibold">イベントカレンダー</h1><span className="text-sm text-muted-foreground">{currentUser.nickname}</span></div>
      <div className="flex items-center gap-2"><Link href="/planning" className="text-sm text-muted-foreground underline-offset-4 hover:underline">イベント企画</Link><Link href="/availability" className="text-sm text-muted-foreground underline-offset-4 hover:underline">空き状況</Link>{preview && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700">ローカルプレビュー</span>}<Button size="sm" onClick={() => setPanel({ kind: "form", event: null })}><Plus /> イベント作成</Button>{!preview && <SignOutButton variant="ghost" />}</div>
    </header>}
    <div className={`mx-auto grid max-w-7xl gap-4 p-4 ${compact ? "grid-cols-1" : "md:grid-cols-[1fr_320px] md:p-8"}`}>
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between border-b p-3"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => setCursor((d) => view === "month" ? subMonths(d, 1) : subWeeks(d, 1))}><ChevronLeft /></Button><Button variant="ghost" size="icon" onClick={() => setCursor((d) => view === "month" ? addMonths(d, 1) : addWeeks(d, 1))}><ChevronRight /></Button><Button variant="outline" size="sm" onClick={() => setCursor(asJstCalendarDate(new Date()))}>今日</Button><h2 className="ml-2 font-semibold">{view === "month" ? format(cursor, "yyyy年M月", { locale: ja }) : `${format(days[0], "M/d")} - ${format(days.at(-1)!, "M/d")}`}</h2></div><div className="flex rounded-lg border p-0.5 text-sm"><button className={`rounded px-2 py-1 ${view === "month" ? "bg-muted font-medium" : ""}`} onClick={() => setView("month")}>月</button><button className={`rounded px-2 py-1 ${view === "week" ? "bg-muted font-medium" : ""}`} onClick={() => setView("week")}>週</button></div></div>
        <div className={`grid grid-cols-7 ${view === "week" ? "min-h-[520px]" : ""}`}>{["月", "火", "水", "木", "金", "土", "日"].map((d) => <div key={d} className="border-b p-2 text-center text-xs text-muted-foreground">{d}</div>)}{days.map((day) => { const dayEvents = events.filter((event) => isSameDay(asJstCalendarDate(event.start_at), day)); return <div key={day.toISOString()} className={`min-h-24 border-b border-r p-1.5 ${!isSameMonth(day, cursor) && view === "month" ? "bg-muted/30 text-muted-foreground" : ""}`}><div className="mb-1 text-xs">{format(day, "d")}</div>{dayEvents.map((event) => <button key={event.id} onClick={() => setPanel({ kind: "detail", event })} className={`mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left text-xs hover:bg-primary/20 ${event.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "bg-primary/10"}`}>{time(event.start_at)} {event.title}</button>)}</div>; })}</div>
      </section>
      {!compact && <aside className="hidden rounded-xl border bg-background p-4 md:block">{panel.kind === "detail" ? <EventDetail event={panel.event} participants={selectedParticipants} names={names} currentUser={currentUser} onRespond={respond} onEdit={() => setPanel({ kind: "form", event: panel.event })} onCancel={() => cancelEvent(panel.event)} /> : panel.kind === "form" ? <EventForm event={panel.event} onSubmit={saveEvent} onClose={() => setPanel({ kind: "none" })} /> : <p className="text-sm text-muted-foreground">イベントを選択してください。</p>}</aside>}
    </div>
    {panel.kind !== "none" && <div className={`fixed inset-0 z-40 bg-black/30 ${compact ? "" : "md:hidden"}`} onClick={() => setPanel({ kind: "none" })}><section className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border bg-background p-4 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-2 flex justify-end"><Button variant="ghost" size="icon" aria-label="閉じる" onClick={() => setPanel({ kind: "none" })}><X /></Button></div>{panel.kind === "detail" ? <EventDetail event={panel.event} participants={selectedParticipants} names={names} currentUser={currentUser} onRespond={respond} onEdit={() => setPanel({ kind: "form", event: panel.event })} onCancel={() => cancelEvent(panel.event)} /> : <EventForm event={panel.event} onSubmit={saveEvent} onClose={() => setPanel({ kind: "none" })} />}</section></div>}
  </main>;
}

function EventDetail({ event, participants, names, currentUser, onRespond, onEdit, onCancel }: { event: Event; participants: Participant[]; names: Map<string, Profile>; currentUser: Profile; onRespond: (s: EventParticipantStatus) => void; onEdit: () => void; onCancel: () => void }) {
  const mine = participants.find((p) => p.user_id === currentUser.id)?.status;
  const grouped = (Object.keys(statusLabel) as EventParticipantStatus[]).map((status) => ({ status, people: participants.filter((participant) => participant.status === status) })).filter((group) => group.people.length);
  return <div className="space-y-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{event.status === "cancelled" ? "キャンセル済み" : "イベント詳細"}</p><h2 className="text-xl font-semibold">{event.title}</h2><p className="text-sm text-muted-foreground">主催: {names.get(event.created_by)?.nickname ?? "メンバー"}</p></div>{event.created_by === currentUser.id && event.status !== "cancelled" && <div className="flex"><Button variant="ghost" size="icon" aria-label="編集" onClick={onEdit}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="キャンセル" onClick={onCancel}><CircleX /></Button></div>}</div><p className="text-sm">{jst.format(new Date(event.start_at))}<br />〜 {jst.format(new Date(event.end_at))}</p>{event.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{event.description}</p>}{event.status !== "cancelled" && <div className="space-y-2"><p className="flex items-center gap-1 text-sm font-medium"><Users className="size-4" />参加表明</p><div className="flex flex-wrap gap-2">{(Object.keys(statusLabel) as EventParticipantStatus[]).map((status) => <Button key={status} size="sm" variant={mine === status ? "default" : "outline"} onClick={() => onRespond(status)}>{statusLabel[status]}</Button>)}</div><p className="text-xs text-muted-foreground">参加表明済み {participants.length}名</p></div>}<div className="space-y-3 border-t pt-3 text-sm">{grouped.map((group) => <div key={group.status}><p className="mb-1 font-medium">{statusLabel[group.status]} ({group.people.length}名)</p><div className="space-y-1">{group.people.map((participant) => <div key={participant.user_id} className="text-muted-foreground">{names.get(participant.user_id)?.nickname ?? "メンバー"}</div>)}</div></div>)}{!participants.length && <p className="text-muted-foreground">まだ参加表明はありません。</p>}</div></div>;
}

function EventForm({ event, onSubmit, onClose }: { event: Event | null; onSubmit: (form: FormData) => void; onClose: () => void }) {
  const local = (value?: string) => value ? formatInTimeZone(new Date(value), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm") : "";
  return <form action={onSubmit} className="space-y-4"><h2 className="text-lg font-semibold">{event ? "イベントを編集" : "イベントを作成"}</h2><label className="block space-y-1 text-sm">タイトル<Input name="title" required defaultValue={event?.title ?? ""} /></label><label className="block space-y-1 text-sm">開始（日本時間）<Input name="start" type="datetime-local" required defaultValue={local(event?.start_at)} /></label><label className="block space-y-1 text-sm">終了（日本時間）<Input name="end" type="datetime-local" required defaultValue={local(event?.end_at)} /></label><label className="block space-y-1 text-sm">説明<textarea name="description" defaultValue={event?.description ?? ""} className="min-h-24 w-full rounded-lg border bg-transparent p-2 text-sm" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>閉じる</Button><Button type="submit">保存</Button></div></form>;
}
