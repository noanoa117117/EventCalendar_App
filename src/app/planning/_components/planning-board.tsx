"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { addDevEvent } from "@/lib/dev-auth";
import { expandToSlots, jstToday, minutesToTime, type TimeRange } from "@/lib/availability";
import type { Profile, Slot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const durations = [30, 60, 90, 120] as const;
const times = Array.from({ length: 48 }, (_, i) => i * 30);

export function PlanningBoard({ currentUser, members, initialSlots = [], preview = false, onEventCreated }: { currentUser: Profile; members: Profile[]; initialSlots?: Slot[]; preview?: boolean; onEventCreated?: (event: { id: string }) => void }) {
  const [week, setWeek] = useState(() => startOfWeek(new Date(`${jstToday()}T12:00:00`), { weekStartsOn: 1 }));
  const [selectedIds, setSelectedIds] = useState(() => new Set([currentUser.id]));
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [picked, setPicked] = useState<{ date: string; start: number } | null>(null);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const request = useRef(0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const dates = useMemo(() => days.map((day) => format(day, "yyyy-MM-dd")), [days]);

  const fetchSlots = useCallback(async () => {
    if (preview) return;
    if (selectedIds.size === 0) { setSlots([]); return; }
    const generation = ++request.current;
    setLoading(true);
    const { data, error } = await createClient().from("availability_slots").select("*")
      .in("user_id", Array.from(selectedIds)).gte("date", dates[0]).lte("date", dates[6]);
    if (generation !== request.current) return;
    setLoading(false);
    if (error) { toast.error("空き時間の取得に失敗しました。"); return; }
    setSlots(data ?? []);
  }, [dates, preview, selectedIds]);

  // This effect synchronizes the board with the external Supabase query.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const availability = useMemo(() => {
    const byDate = new Map<string, Map<string, Set<string>>>();
    for (const date of dates) {
      const users = new Map<string, Set<string>>();
      for (const id of selectedIds) {
        const ranges: TimeRange[] = slots.filter((s) => s.date === date && s.user_id === id)
          .map(({ start_time, end_time }) => ({ start_time, end_time }));
        users.set(id, new Set(expandToSlots(ranges)));
      }
      byDate.set(date, users);
    }
    return byDate;
  }, [dates, selectedIds, slots]);

  function countAvailable(date: string, minute: number) {
    const cell = minutesToTime(minute);
    return Array.from(availability.get(date)?.values() ?? []).filter((set) => set.has(cell)).length;
  }
  function canUse(date: string, minute: number, length: number) {
    if (minute + length > 1440 || selectedIds.size === 0) return false;
    for (let offset = 0; offset < length; offset += 30) if (countAvailable(date, minute + offset) !== selectedIds.size) return false;
    return true;
  }
  const selectedDate = picked?.date ?? dates[0];
  const selectedStart = picked?.start ?? 9 * 60;

  async function createEvent() {
    if (!picked || !title.trim() || !canUse(picked.date, picked.start, duration)) { toast.error("共通の空き時間とタイトルを選択してください。"); return; }
    const start = new Date(`${picked.date}T${minutesToTime(picked.start)}:00+09:00`);
    const end = new Date(start.getTime() + duration * 60_000);
    const payload = { title: title.trim(), description: null, start_at: start.toISOString(), end_at: end.toISOString(), created_by: currentUser.id, status: "published" as const };
    if (preview) {
      const created = addDevEvent(payload);
      onEventCreated?.(created);
      const local = JSON.parse(window.localStorage.getItem("eventcalendar-dev-events") ?? "[]") as unknown[];
      window.localStorage.setItem("eventcalendar-dev-events", JSON.stringify([...local, { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }]));
      toast.success("イベントを作成しました（ローカル）。"); router.push("/events"); return;
    }
    const { error } = await createClient().from("events").insert(payload);
    if (error) { toast.error("イベントの作成に失敗しました。"); return; }
    toast.success("イベントを作成しました。");
    onEventCreated?.({ id: "created" });
    router.push("/events");
  }

  return <main className="min-h-dvh bg-muted/20"><header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 md:px-8"><div><h1 className="text-lg font-semibold">イベント企画</h1><p className="text-xs text-muted-foreground">JST・共通の空き時間</p></div><div className="flex gap-3"><Link href="/events" className="text-sm underline-offset-4 hover:underline">イベント一覧</Link><Link href="/availability" className="text-sm underline-offset-4 hover:underline">空き状況</Link></div></header>
    <div className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[200px_1fr_280px] md:p-8">
      <aside className="rounded-xl border bg-background p-4"><h2 className="mb-3 font-medium">メンバー</h2><div className="space-y-2">{members.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.has(member.id)} onChange={() => setSelectedIds((old) => { const next = new Set(old); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next; })} /><span className="size-2 rounded-full" style={{ backgroundColor: member.color }} />{member.nickname}</label>)}</div></aside>
      <section className="overflow-auto rounded-xl border bg-background p-3"><div className="mb-3 flex items-center justify-between"><Button size="sm" variant="outline" onClick={() => setWeek((d) => addDays(d, -7))}>前週</Button><h2 className="font-medium">{format(days[0], "M月d日", { locale: ja })} - {format(days[6], "M月d日", { locale: ja })}</h2><Button size="sm" variant="outline" onClick={() => setWeek((d) => addDays(d, 7))}>次週</Button></div><p className="mb-2 text-xs text-muted-foreground">セルは30分単位です。人数は選択メンバー中の空き人数。</p>{loading && <p className="text-xs text-muted-foreground">更新中...</p>}<div className="min-w-[620px]"><div className="grid grid-cols-[56px_repeat(7,minmax(70px,1fr))]"> <div />{days.map((day, i) => <div key={dates[i]} className="border-b p-1 text-center text-xs font-medium">{format(day, "EEE", { locale: ja })}<br />{format(day, "M/d")}</div>)}{times.map((minute) => <div key={minute} className="contents"><div className="border-r px-1 py-1 text-right text-[10px] text-muted-foreground">{minute % 60 === 0 ? minutesToTime(minute) : ""}</div>{dates.map((date) => { const count = countAvailable(date, minute); const common = count === selectedIds.size && selectedIds.size > 0; const active = picked?.date === date && picked.start === minute; return <button key={`${date}-${minute}`} type="button" disabled={!common} onClick={() => { setPicked({ date, start: minute }); setDuration(durations.find((d) => canUse(date, minute, d)) ?? 30); }} className={`h-7 border-b border-r text-[10px] ${active ? "bg-primary text-primary-foreground" : common ? "bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40" : "bg-muted/30 text-muted-foreground"}`} aria-label={`${date} ${minutesToTime(minute)} ${count}/${selectedIds.size}人`}>{count}/{selectedIds.size}</button>; })}</div>)}</div></div></section>
      <aside className="rounded-xl border bg-background p-4"><h2 className="mb-3 font-medium">イベント作成</h2><div className="space-y-3"><label className="block text-sm">タイトル<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：定例ミーティング" /></label><p className="text-sm">日時：{selectedDate} {minutesToTime(selectedStart)}（JST）</p><fieldset><legend className="mb-1 text-sm">時間</legend><div className="grid grid-cols-4 gap-1">{durations.map((d) => <Button key={d} type="button" size="sm" variant={duration === d ? "default" : "outline"} disabled={!picked || !canUse(selectedDate, selectedStart, d)} onClick={() => setDuration(d)}>{d}分</Button>)}</div></fieldset><p className="text-xs text-muted-foreground">イベント作成者はあなたのみです。選択メンバーは自動参加登録されません。</p><Button className="w-full" disabled={!picked || !title.trim() || !canUse(selectedDate, selectedStart, duration)} onClick={createEvent}>イベントを作成</Button></div></aside>
    </div></main>;
}
