"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { ja } from "date-fns/locale";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, CircleX, Pencil, Plus, Shield, Users, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AllowedEmailRole, Database, EventParticipantStatus, EventStatus, GoogleSyncStatus } from "@/lib/database.types";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignOutButton } from "@/components/sign-out-button";
import { AppHeader } from "@/components/app-header";
import { NightScene } from "@/components/night-beach-scene";
import { useRouter } from "next/navigation";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Participant = Database["public"]["Tables"]["event_participants"]["Row"];
type View = "month" | "week";
type Panel = { kind: "none" } | { kind: "detail"; event: Event } | { kind: "form"; event: Event | null } | { kind: "day-list"; date: Date; events: Event[] };

const time = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const JST = "Asia/Tokyo";
const asJstCalendarDate = (value: Date | string) => toZonedTime(typeof value === "string" ? new Date(value) : value, JST);
const statusLabel: Record<EventParticipantStatus, string> = { going: "参加", maybe: "未定", declined: "不参加" };

export function EventCalendar({ currentUser, initialEvents, initialParticipants, people, role, preview = false, compact = false }: { currentUser: Profile; initialEvents: Event[]; initialParticipants: Participant[]; people: Profile[]; role?: AllowedEmailRole | null; preview?: boolean; compact?: boolean }) {
  const [events, setEvents] = useState(initialEvents);
  const [participants, setParticipants] = useState(initialParticipants);
  // Keep date-fns' calendar arithmetic based on JST-shaped calendar dates so
  // the grid does not shift when a user views it from another time zone.
  const [cursor, setCursor] = useState(() => asJstCalendarDate(new Date()));
  const [view, setView] = useState<View>("month");
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [creationChoiceOpen, setCreationChoiceOpen] = useState(false);
  const router = useRouter();
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
        : { id: crypto.randomUUID(), ...payload, created_by: currentUser.id, status: "published", created_at: new Date().toISOString(), google_sync_status: null, google_sync_error: null, google_synced_at: null };
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
    triggerSync(result.data.id);
  }

  async function cancelEvent(event: Event) {
    if (!window.confirm("このイベントをキャンセルしますか？")) return;
    if (preview) {
      const data = { ...event, status: "cancelled" as EventStatus };
      setEvents((old) => old.map((e) => e.id === data.id ? data : e)); setPanel({ kind: "detail", event: data });
      toast.success("イベントをキャンセルしました（ローカル）。");
      return;
    }
    const response = await fetch("/api/events/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: event.id }) });
    const result = await response.json();
    const data = result.event as Event | undefined;
    if (!response.ok || !data) { toast.error("キャンセルに失敗しました。"); return; }
    setEvents((old) => old.map((e) => e.id === data.id ? data : e)); setPanel({ kind: "detail", event: data });
    const notifications = result.notifications as { total?: number; sent?: number; failed?: number } | undefined;
    if ((notifications?.failed ?? 0) > 0) {
      toast.warning(`イベントをキャンセルしました。メール通知は${notifications?.sent ?? 0}名に送信され、${notifications?.failed}名は送信できませんでした。`);
    } else if ((notifications?.sent ?? 0) > 0) {
      toast.success(`イベントをキャンセルし、${notifications?.sent}名へ通知しました。`);
    } else {
      toast.success("イベントをキャンセルしました。");
    }
    triggerSync(data.id);
  }

  async function triggerSync(eventId: string) {
    if (preview) return;
    try {
      const res = await fetch("/api/events/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (data.status === "synced") {
        setEvents((old) => old.map((e) => e.id === eventId ? { ...e, google_sync_status: "synced" as GoogleSyncStatus, google_sync_error: null, google_synced_at: new Date().toISOString() } : e));
      } else if (data.status === "failed") {
        setEvents((old) => old.map((e) => e.id === eventId ? { ...e, google_sync_status: "failed" as GoogleSyncStatus, google_sync_error: data.error ?? null } : e));
      }
    } catch { /* sync is best-effort */ }
  }

  return <main className={`@container flex flex-col ${compact ? "min-h-0" : "h-dvh"}`}>
    {!compact && <NightScene />}
    {!compact && <AppHeader current="events">
      {preview && <span className="rounded-full border border-warning/40 bg-warning-soft px-2 py-1 text-xs font-medium text-warning-foreground">ローカルプレビュー</span>}
      {!preview && <SignOutButton variant="ghost" />}
    </AppHeader>}
    <div className="mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 gap-4 p-4 @3xl:grid-cols-[1fr_320px] @3xl:p-8">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => setCursor((d) => view === "month" ? subMonths(d, 1) : subWeeks(d, 1))}><ChevronLeft /></Button><Button variant="ghost" size="icon" onClick={() => setCursor((d) => view === "month" ? addMonths(d, 1) : addWeeks(d, 1))}><ChevronRight /></Button><Button variant="outline" size="sm" onClick={() => setCursor(asJstCalendarDate(new Date()))}>今日</Button><h2 className="ml-2 font-semibold">{view === "month" ? format(cursor, "yyyy年M月", { locale: ja }) : `${format(days[0], "M/d")} - ${format(days.at(-1)!, "M/d")}`}</h2></div><div className="flex items-center gap-2">{!compact && (role === "admin" || role === "super_user") && <Link href="/admin" className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:bg-warning/20 @3xl:flex"><Shield className="size-3.5" />管理</Link>}{!compact && <Button size="sm" className="hidden @3xl:inline-flex" onClick={() => setCreationChoiceOpen(true)}><Plus className="size-4" /> イベント作成</Button>}<div className="flex rounded-lg border p-0.5 text-sm"><button className={`rounded px-2 py-1 ${view === "month" ? "bg-muted font-medium" : ""}`} onClick={() => setView("month")}>月</button><button className={`rounded px-2 py-1 ${view === "week" ? "bg-muted font-medium" : ""}`} onClick={() => setView("week")}>週</button></div></div></div>
        {!compact && <div className="flex items-center justify-end gap-2 border-b p-2 @3xl:hidden">{(role === "admin" || role === "super_user") && <Link href="/admin" className="flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:bg-warning/20"><Shield className="size-3.5" />管理</Link>}<Button size="sm" onClick={() => setCreationChoiceOpen(true)}><Plus className="size-4" /> イベント作成</Button></div>}
        {view === "week" ? (
          <div className="min-h-0 flex-1 divide-y overflow-y-auto @3xl:hidden">{days.map((day) => { const dayEvents = events.filter((event) => isSameDay(asJstCalendarDate(event.start_at), day)); const today = isSameDay(day, asJstCalendarDate(new Date())); return <div key={day.toISOString()} className={`px-3 py-2 ${today ? "bg-today/10" : ""}`}><div className="mb-1 flex items-center gap-2"><span className="text-sm font-semibold">{format(day, "M/d", { locale: ja })}</span><span className="text-xs text-muted-foreground">{format(day, "EEEE", { locale: ja })}</span>{today && <span className="rounded-full bg-today px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">今日</span>}</div>{dayEvents.length > 0 ? dayEvents.map((event) => <button key={event.id} onClick={() => setPanel({ kind: "detail", event })} className={`mb-1 block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-event-soft ${event.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "bg-event-soft text-event-foreground"}`}>{time(event.start_at)} {event.title}</button>) : <p className="text-xs text-muted-foreground">予定なし</p>}</div>; })}</div>
        ) : null}
        <div className={`grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground ${view === "week" ? "hidden @3xl:grid" : ""}`}>{["月", "火", "水", "木", "金", "土", "日"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        <div className={`grid flex-1 grid-cols-7 ${view === "week" ? "hidden @3xl:grid" : ""}`} style={{ gridTemplateRows: `repeat(${Math.ceil(days.length / 7)}, minmax(0, 1fr))` }}>{days.map((day) => { const dayEvents = events.filter((event) => isSameDay(asJstCalendarDate(event.start_at), day)); return <div key={day.toISOString()} onClick={() => { if (dayEvents.length === 1) setPanel({ kind: "detail", event: dayEvents[0] }); else if (dayEvents.length > 1) setPanel({ kind: "day-list", date: day, events: dayEvents }); }} className={`border-b border-r p-1 @3xl:p-1.5 ${!isSameMonth(day, cursor) && view === "month" ? "bg-muted/30 text-muted-foreground" : ""} ${dayEvents.length >= 1 ? "cursor-pointer @3xl:cursor-default" : ""}`}><div className="mb-0.5 text-center text-xs @3xl:mb-1 @3xl:text-left">{format(day, "d")}</div>{dayEvents.length > 0 && <div className="flex justify-center @3xl:hidden"><span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-medium ${dayEvents.some((e) => e.status === "cancelled") && dayEvents.every((e) => e.status === "cancelled") ? "bg-muted-foreground/20 text-muted-foreground" : "bg-primary/15 text-primary"}`}>{dayEvents.length}</span></div>}<div className="hidden @3xl:block">{dayEvents.map((event) => <button key={event.id} onClick={(e) => { e.stopPropagation(); setPanel({ kind: "detail", event }); }} className={`mb-1 block w-full truncate rounded-md px-1.5 py-1 text-left text-xs hover:bg-event-soft ${event.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "bg-event-soft text-event-foreground"}`}>{time(event.start_at)} {event.title}</button>)}</div></div>; })}</div>
      </section>
      <aside className="hidden rounded-xl border bg-card p-4 shadow-sm @3xl:block">{panel.kind === "detail" ? <EventDetail event={panel.event} participants={selectedParticipants} names={names} currentUser={currentUser} onRespond={respond} onEdit={() => setPanel({ kind: "form", event: panel.event })} onCancel={() => cancelEvent(panel.event)} onResync={() => triggerSync(panel.event.id)} preview={preview} /> : panel.kind === "form" ? <EventForm event={panel.event} onSubmit={saveEvent} onClose={() => setPanel({ kind: "none" })} /> : <p className="text-sm text-muted-foreground">イベントを選択してください。</p>}</aside>
    </div>
    {panel.kind !== "none" && <div className="fixed inset-0 z-[60] bg-scrim @3xl:hidden" onClick={() => setPanel({ kind: "none" })}><section className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-2 flex justify-end"><Button variant="ghost" size="icon" aria-label="閉じる" onClick={() => setPanel({ kind: "none" })}><X /></Button></div>{panel.kind === "detail" ? <EventDetail event={panel.event} participants={selectedParticipants} names={names} currentUser={currentUser} onRespond={respond} onEdit={() => setPanel({ kind: "form", event: panel.event })} onCancel={() => cancelEvent(panel.event)} onResync={() => triggerSync(panel.event.id)} preview={preview} /> : panel.kind === "day-list" ? <div className="space-y-2"><h2 className="text-lg font-semibold">{format(panel.date, "M月d日（EEEE）", { locale: ja })}</h2><div className="divide-y">{panel.events.map((event) => <button key={event.id} onClick={() => setPanel({ kind: "detail", event })} className={`block w-full px-2 py-2.5 text-left text-sm hover:bg-event-soft ${event.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}><span className="font-medium">{time(event.start_at)}</span> {event.title}</button>)}</div></div> : <EventForm event={panel.event} onSubmit={saveEvent} onClose={() => setPanel({ kind: "none" })} />}</section></div>}
    <Dialog open={creationChoiceOpen} onOpenChange={setCreationChoiceOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>予定を作る前に、メンバーの空き時間を確認しますか？</DialogTitle><DialogDescription>空き時間を確認して共通の日時を選ぶことも、確認せずに予定を作ることもできます。</DialogDescription></DialogHeader><DialogFooter className="flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={() => router.push("/planning")}>メンバーの空き時間を確認</Button><Button onClick={() => { setCreationChoiceOpen(false); setPanel({ kind: "form", event: null }); }}>確認せずに作成</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function EventDetail({ event, participants, names, currentUser, onRespond, onEdit, onCancel, onResync, preview }: { event: Event; participants: Participant[]; names: Map<string, Profile>; currentUser: Profile; onRespond: (s: EventParticipantStatus) => void; onEdit: () => void; onCancel: () => void; onResync: () => void; preview: boolean }) {
  const mine = participants.find((p) => p.user_id === currentUser.id)?.status;
  const grouped = (Object.keys(statusLabel) as EventParticipantStatus[]).map((status) => ({ status, people: participants.filter((participant) => participant.status === status) })).filter((group) => group.people.length);
  const startDateLabel = formatInTimeZone(new Date(event.start_at), JST, "M/d（EEE）", { locale: ja });
  const endDateLabel = formatInTimeZone(new Date(event.end_at), JST, "M/d（EEE）", { locale: ja });
  const startTimeLabel = formatInTimeZone(new Date(event.start_at), JST, "HH:mm");
  const endTimeLabel = formatInTimeZone(new Date(event.end_at), JST, "HH:mm");
  const sameDay = startDateLabel === endDateLabel;
  return <div className="space-y-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{event.status === "cancelled" ? "キャンセル済み" : "イベント詳細"}</p><h2 className="text-xl font-semibold">{event.title}</h2><p className="text-sm text-muted-foreground">主催: {names.get(event.created_by)?.nickname ?? "メンバー"}</p></div>{event.created_by === currentUser.id && event.status !== "cancelled" && <div className="flex"><Button variant="ghost" size="icon" aria-label="編集" onClick={onEdit}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="キャンセル" onClick={onCancel}><CircleX /></Button></div>}</div><p className="text-sm">{startDateLabel} {startTimeLabel}{sameDay ? `–${endTimeLabel}` : <><br />〜 {endDateLabel} {endTimeLabel}</>}</p>{event.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{event.description}</p>}{event.status !== "cancelled" && <div className="space-y-2"><p className="flex items-center gap-1 text-sm font-medium"><Users className="size-4" />参加表明</p><div className="flex flex-wrap gap-2">{(Object.keys(statusLabel) as EventParticipantStatus[]).map((status) => <Button key={status} size="sm" variant={mine === status ? "default" : "outline"} onClick={() => onRespond(status)}>{statusLabel[status]}</Button>)}</div><p className="text-xs text-muted-foreground">参加表明済み {participants.length}名</p></div>}<div className="space-y-3 border-t pt-3 text-sm">{grouped.map((group) => <div key={group.status}><p className="mb-1 font-medium">{statusLabel[group.status]} ({group.people.length}名)</p><div className="space-y-1">{group.people.map((participant) => <div key={participant.user_id} className="text-muted-foreground">{names.get(participant.user_id)?.nickname ?? "メンバー"}</div>)}</div></div>)}{!participants.length && <p className="text-muted-foreground">まだ参加表明はありません。</p>}</div>{!preview && event.google_sync_status && <div className="border-t pt-3 text-xs">{event.google_sync_status === "synced" && <p className="text-muted-foreground">Googleカレンダーに同期済み</p>}{event.google_sync_status === "pending" && <p className="text-muted-foreground">同期中...</p>}{event.google_sync_status === "failed" && <div className="space-y-1"><p className="text-destructive">同期失敗{event.google_sync_error ? `: ${event.google_sync_error}` : ""}</p>{event.created_by === currentUser.id && <Button size="sm" variant="outline" onClick={onResync}>再同期</Button>}</div>}</div>}</div>;
}

function EventForm({ event, onSubmit, onClose }: { event: Event | null; onSubmit: (form: FormData) => Promise<void>; onClose: () => void }) {
  const local = (value?: string) => value ? formatInTimeZone(new Date(value), "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm") : "";
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitOnce(form: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return <form action={submitOnce} className="space-y-4"><h2 className="text-lg font-semibold">{event ? "イベントを編集" : "イベントを作成"}</h2><label className="block space-y-1 text-sm">タイトル<Input name="title" required defaultValue={event?.title ?? ""} /></label><label className="block space-y-1 text-sm">開始（日本時間）<Input name="start" type="datetime-local" required defaultValue={local(event?.start_at)} /></label><label className="block space-y-1 text-sm">終了（日本時間）<Input name="end" type="datetime-local" required defaultValue={local(event?.end_at)} /></label><label className="block space-y-1 text-sm">説明<textarea name="description" defaultValue={event?.description ?? ""} className="min-h-24 w-full rounded-lg border bg-transparent p-2 text-sm" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { if (!submittingRef.current) onClose(); }} disabled={isSubmitting}>閉じる</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "保存中..." : "保存"}</Button></div></form>;
}
