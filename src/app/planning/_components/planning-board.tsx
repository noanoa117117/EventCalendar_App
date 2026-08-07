"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, isToday, startOfWeek } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { addDevEvent } from "@/lib/dev-auth";
import { expandToSlots, jstToday, minutesToTime, type TimeRange } from "@/lib/availability";
import type { Profile, Slot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AppHeader } from "@/components/app-header";

const durations = [30, 60, 90, 120] as const;

interface Window {
  start: number;
  end: number;
}

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
    if (selectedIds.size === 0) { setLoading(false); setSlots([]); return; }
    const generation = ++request.current;
    setLoading(true);
    const { data, error } = await createClient().from("availability_slots").select("*")
      .in("user_id", Array.from(selectedIds)).gte("date", dates[0]).lte("date", dates[6]);
    if (generation !== request.current) return;
    setLoading(false);
    if (error) { toast.error("空き時間の取得に失敗しました。"); return; }
    setSlots(data ?? []);
  }, [dates, preview, selectedIds]);

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

  const commonWindows = useMemo(() => {
    if (selectedIds.size === 0) return dates.map((date) => ({ date, windows: [] as Window[] }));
    return dates.map((date) => {
      const windows: Window[] = [];
      let windowStart: number | null = null;
      for (let minute = 0; minute < 1440; minute += 30) {
        const cell = minutesToTime(minute);
        const allFree = Array.from(availability.get(date)?.values() ?? []).every((set) => set.has(cell));
        if (allFree) {
          if (windowStart === null) windowStart = minute;
        } else {
          if (windowStart !== null) {
            windows.push({ start: windowStart, end: minute });
            windowStart = null;
          }
        }
      }
      if (windowStart !== null) windows.push({ start: windowStart, end: 1440 });
      return { date, windows };
    });
  }, [dates, selectedIds, availability]);

  function canUse(date: string, start: number, len: number) {
    const entry = commonWindows.find((w) => w.date === date);
    if (!entry) return false;
    return entry.windows.some((w) => start >= w.start && start + len <= w.end);
  }

  function pickWindow(date: string, win: Window) {
    const bestDuration = durations.find((d) => d <= win.end - win.start) ?? 30;
    setPicked({ date, start: win.start });
    setDuration(bestDuration <= win.end - win.start ? bestDuration : 30);
  }

  function startsInWindow(date: string, win: Window): string[] {
    const result: string[] = [];
    for (let m = win.start; m + 30 <= win.end; m += 30) {
      result.push(minutesToTime(m));
    }
    return result;
  }

  const pickedWindow = picked
    ? commonWindows.find((d) => d.date === picked.date)?.windows.find((w) => picked.start >= w.start && picked.start < w.end) ?? null
    : null;

  async function createEvent() {
    if (!picked || !title.trim() || !canUse(picked.date, picked.start, duration)) {
      toast.error("共通の空き時間とタイトルを選択してください。");
      return;
    }
    const start = new Date(`${picked.date}T${minutesToTime(picked.start)}:00+09:00`);
    const end = new Date(start.getTime() + duration * 60_000);
    const payload = { title: title.trim(), description: null, start_at: start.toISOString(), end_at: end.toISOString(), created_by: currentUser.id, status: "published" as const };
    if (preview) {
      const created = addDevEvent(payload);
      onEventCreated?.(created);
      const local = JSON.parse(window.localStorage.getItem("eventcalendar-dev-events") ?? "[]") as unknown[];
      window.localStorage.setItem("eventcalendar-dev-events", JSON.stringify([...local, { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }]));
      toast.success("イベントを作成しました（ローカル）。");
      router.push("/events");
      return;
    }
    const { error } = await createClient().from("events").insert(payload);
    if (error) { toast.error("イベントの作成に失敗しました。"); return; }
    toast.success("イベントを作成しました。");
    onEventCreated?.({ id: "created" });
    router.push("/events");
  }

  function toggleMember(id: string) {
    setSelectedIds((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalWindows = commonWindows.reduce((sum, d) => sum + d.windows.length, 0);

  return (
    <main className="min-h-dvh bg-muted/20">
      <AppHeader current="planning" />

      <div className="mx-auto max-w-3xl p-4 md:p-6">
        {/* Member selection */}
        <div className="mb-4 rounded-xl border bg-background p-3 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">メンバーを選択</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={selectedIds.has(member.id)} onCheckedChange={() => toggleMember(member.id)} />
                <span className="size-2 rounded-full" style={{ backgroundColor: member.color }} />
                <span>{member.nickname}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Week navigation */}
        <div className="mb-4 flex items-center justify-between">
          <Button size="icon" variant="ghost" disabled={loading} onClick={() => setWeek((d) => addDays(d, -7))} aria-label="前週">
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-sm font-semibold">
            {format(days[0], "M/d（EEE）", { locale: ja })} – {format(days[6], "M/d（EEE）", { locale: ja })}
          </h2>
          <Button size="icon" variant="ghost" disabled={loading} onClick={() => setWeek((d) => addDays(d, 7))} aria-label="次週">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {loading && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border bg-background p-4 text-sm shadow-sm">
            <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" aria-hidden="true" />
            読み込み中…
          </div>
        )}

        {!loading && selectedIds.size === 0 && (
          <div className="rounded-xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground shadow-sm">
            メンバーを選択してください
          </div>
        )}

        {!loading && selectedIds.size > 0 && (
          <div className="grid gap-3 md:grid-cols-[1fr_280px] md:items-start md:gap-4">
            {/* Availability slots list */}
            <div className="space-y-2">
              {totalWindows === 0 && (
                <div className="rounded-xl border border-dashed bg-background p-6 text-center text-sm text-muted-foreground shadow-sm">
                  この週に全員が空いている時間帯はありません
                </div>
              )}
              {commonWindows.map(({ date, windows: wins }) => {
                const day = new Date(`${date}T12:00:00`);
                const today = isToday(day);
                if (wins.length === 0 && totalWindows > 0) return null;
                return (
                  <div key={date} className="rounded-xl border bg-background shadow-sm">
                    <div className={`flex items-baseline gap-2 border-b px-3 py-2 ${today ? "bg-primary/5" : ""}`}>
                      <span className="text-sm font-semibold">{format(day, "M/d", { locale: ja })}</span>
                      <span className="text-xs text-muted-foreground">{format(day, "EEEE", { locale: ja })}</span>
                      {today && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">今日</span>}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {wins.length > 0 ? `${wins.length}件の候補` : "空きなし"}
                      </span>
                    </div>
                    {wins.length > 0 && (
                      <div className="divide-y">
                        {wins.map((win) => {
                          const isSelected = picked?.date === date && picked.start >= win.start && picked.start < win.end;
                          const durationMin = win.end - win.start;
                          const hours = Math.floor(durationMin / 60);
                          const mins = durationMin % 60;
                          const durationLabel = hours > 0 && mins > 0 ? `${hours}時間${mins}分` : hours > 0 ? `${hours}時間` : `${mins}分`;
                          return (
                            <button
                              key={`${date}-${win.start}`}
                              type="button"
                              onClick={() => pickWindow(date, win)}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                isSelected ? "bg-primary/8" : "hover:bg-accent/50"
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className={`size-2 shrink-0 rounded-full ${isSelected ? "bg-primary" : "bg-emerald-500"}`} />
                                <span className="text-sm font-medium">
                                  {minutesToTime(win.start)}–{minutesToTime(win.end)}
                                </span>
                                <span className="text-xs text-muted-foreground">{durationLabel}</span>
                              </div>
                              {isSelected && <span className="shrink-0 text-xs font-medium text-primary">選択中</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Event creation panel */}
            <div className="rounded-xl border bg-background p-4 shadow-sm md:sticky md:top-4">
              <div className="mb-4 flex items-center gap-2">
                <CalendarPlus className="size-4 text-primary" />
                <h2 className="font-semibold">イベント作成</h2>
              </div>

              <div className="space-y-4">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">タイトル</span>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：定例ミーティング" />
                </label>

                {picked && pickedWindow ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-accent/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground">選択中</p>
                      <p className="mt-0.5 font-semibold">
                        {picked.date} {minutesToTime(picked.start)}–{minutesToTime(picked.start + duration)}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium">開始時刻</label>
                      <select
                        value={minutesToTime(picked.start)}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(":").map(Number);
                          setPicked({ date: picked.date, start: h * 60 + m });
                        }}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      >
                        {startsInWindow(picked.date, pickedWindow).map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <fieldset>
                      <legend className="mb-1.5 text-sm font-medium">時間</legend>
                      <div className="grid grid-cols-4 gap-1.5">
                        {durations.map((d) => (
                          <Button
                            key={d}
                            type="button"
                            size="sm"
                            variant={duration === d ? "default" : "outline"}
                            disabled={!canUse(picked.date, picked.start, d)}
                            onClick={() => setDuration(d)}
                          >
                            {d}分
                          </Button>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {totalWindows > 0 ? "候補をタップして選択" : "候補がありません"}
                    </p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  選択メンバーは自動参加登録されません。
                </p>

                <Button
                  className="w-full"
                  disabled={loading || !picked || !title.trim() || !canUse(picked.date, picked.start, duration)}
                  onClick={createEvent}
                >
                  <CalendarPlus className="mr-1.5 size-4" />
                  イベントを作成
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
