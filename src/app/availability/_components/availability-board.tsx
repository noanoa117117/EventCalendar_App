"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, addWeeks, format } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  jstNow,
  monthGridRange,
  registrableWindow,
  weekRange,
} from "@/lib/availability";
import type { Preset, Profile, Slot } from "@/lib/types";
import { MemberList } from "./member-list";
import { PresetPanel } from "./preset-panel";
import { MonthCalendar } from "./month-calendar";
import { WeekCalendar } from "./week-calendar";

export function AvailabilityBoard({
  currentUser,
  members,
  initialPresets,
  initialSlots = [],
  preview = false,
}: {
  currentUser: Profile;
  members: Profile[];
  initialPresets: Preset[];
  initialSlots?: Slot[];
  preview?: boolean;
}) {
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [cursorDate, setCursorDate] = useState<Date>(() => jstNow());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set([currentUser.id]),
  );
  const [presets, setPresets] = useState<Preset[]>(initialPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [loading, setLoading] = useState(false);
  const fetchGeneration = useRef(0);

  const editableWindow = useMemo(() => registrableWindow(), []);
  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;

  const range = useMemo(
    () => (viewMode === "month" ? monthGridRange(cursorDate) : weekRange(cursorDate)),
    [viewMode, cursorDate],
  );

  const fetchSlots = useCallback(async () => {
    if (preview) return;
    const generation = ++fetchGeneration.current;
    if (visibleIds.size === 0) {
      setSlots([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("availability_slots")
      .select("*")
      .in("user_id", Array.from(visibleIds))
      .gte("date", format(range.start, "yyyy-MM-dd"))
      .lte("date", format(range.end, "yyyy-MM-dd"));
    if (generation !== fetchGeneration.current) return;
    setLoading(false);
    if (error) {
      toast.error("空き時間の取得に失敗しました。");
      return;
    }
    setSlots(data ?? []);
  }, [visibleIds, range, preview]);

  useEffect(() => {
    // Sync with Supabase (an external system) whenever the visible
    // members or displayed date range change - the classic "fetching
    // data" effect (https://react.dev/learn/you-might-not-need-an-effect
    // #fetching-data). There's no cache/query library in this project's
    // stack to move it into, so this stays a plain effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActivePresetId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleMember(id: string) {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePaint(dates: string[], action: "apply" | "remove", preset: Preset) {
    if (preview) {
      setSlots((prev) => action === "apply"
        ? [...prev.filter((s) => !(s.user_id === currentUser.id && dates.includes(s.date) && s.preset_id === preset.id)), ...dates.map((date, i) => ({ id: `preview-${Date.now()}-${i}`, user_id: currentUser.id, date, start_time: preset.start_time, end_time: preset.end_time, preset_id: preset.id }))]
        : prev.filter((s) => !(s.user_id === currentUser.id && dates.includes(s.date) && s.start_time === preset.start_time && s.end_time === preset.end_time)));
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("set_availability", {
      p_dates: dates,
      p_start: preset.start_time,
      p_end: preset.end_time,
      p_active: action === "apply",
      p_preset_id: action === "apply" ? preset.id : null,
    });
    if (error) {
      toast.error("空き時間の更新に失敗しました。");
      return;
    }
    fetchSlots();
  }

  async function handleWeekDragCommit(
    date: string,
    start: string,
    end: string,
    action: "apply" | "remove",
  ) {
    if (preview) {
      setSlots((prev) => action === "apply"
        ? [...prev.filter((s) => !(s.user_id === currentUser.id && s.date === date && s.start_time >= start && s.end_time <= end)), { id: `preview-${Date.now()}`, user_id: currentUser.id, date, start_time: start, end_time: end, preset_id: null }]
        : prev.filter((s) => !(s.user_id === currentUser.id && s.date === date && s.start_time >= start && s.end_time <= end)));
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("set_availability", {
      p_dates: [date],
      p_start: start,
      p_end: end,
      p_active: action === "apply",
      p_preset_id: null,
    });
    if (error) {
      toast.error("空き時間の更新に失敗しました。");
      return;
    }
    fetchSlots();
  }

  function goPrev() {
    setCursorDate((d) => (viewMode === "month" ? addMonths(d, -1) : addWeeks(d, -1)));
  }
  function goNext() {
    setCursorDate((d) => (viewMode === "month" ? addMonths(d, 1) : addWeeks(d, 1)));
  }
  function goToday() {
    setCursorDate(jstNow());
  }

  const title =
    viewMode === "month"
      ? format(cursorDate, "yyyy年M月", { locale: ja })
      : `${format(range.start, "M/d", { locale: ja })} - ${format(range.end, "M/d", { locale: ja })}`;

  const [mobilePanel, setMobilePanel] = useState<"calendar" | "members" | "presets">("calendar");
  return (
    <div className="flex h-dvh flex-col bg-border">
      {preview && <div className="bg-amber-500/15 px-3 py-1.5 text-center text-xs font-medium text-amber-800">ローカルモック（Supabaseには接続しません）</div>}
      <div className="flex items-center border-b bg-background px-3 py-2 md:hidden">
        <Link href="/events" className="mr-2"><Button size="icon" variant="ghost" aria-label="イベントカレンダーへ戻る"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <Tabs value={mobilePanel} onValueChange={(v) => setMobilePanel(v as typeof mobilePanel)} className="flex-1">
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="calendar">カレンダー</TabsTrigger><TabsTrigger value="members">メンバー</TabsTrigger><TabsTrigger value="presets">プリセット</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-border md:grid-cols-[200px_1fr_260px]">
      <aside className={`${mobilePanel === "members" ? "" : "hidden"} overflow-y-auto bg-background p-4 md:block`}>
        <MemberList
          members={members}
          currentUserId={currentUser.id}
          visibleIds={visibleIds}
          onToggle={toggleMember}
        />
      </aside>

      <main className={`${mobilePanel === "calendar" ? "" : "hidden"} flex min-w-0 flex-col overflow-hidden bg-background md:flex`}>
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <div className="flex items-center gap-1">
            <Link href="/events" className="mr-1 hidden md:block"><Button size="icon" variant="ghost" aria-label="イベントカレンダーへ戻る"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <Button size="icon" variant="ghost" onClick={goPrev} aria-label="前へ">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={goNext} aria-label="次へ">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              今日
            </Button>
            <h1 className="ml-2 text-sm font-semibold">{title}</h1>
            {loading && <span className="text-xs text-muted-foreground">更新中...</span>}
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "month" | "week")}>
            <TabsList>
              <TabsTrigger value="month">月</TabsTrigger>
              <TabsTrigger value="week">週</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activePreset && (
          <div
            className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm"
            style={{ backgroundColor: `${activePreset.color}22` }}
          >
            <span>
              「{activePreset.label}」を適用中 - 日付をクリック／ドラッグで登録・解除
            </span>
            <Button size="sm" variant="ghost" onClick={() => setActivePresetId(null)}>
              <X className="mr-1 h-3.5 w-3.5" />
              終了 (Esc)
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {viewMode === "month" ? (
            <MonthCalendar
              cursorDate={cursorDate}
              members={members}
              visibleIds={visibleIds}
              currentUserId={currentUser.id}
              slots={slots}
              activePreset={activePreset}
              window={editableWindow}
              onPaint={handlePaint}
            />
          ) : (
            <WeekCalendar
              cursorDate={cursorDate}
              members={members}
              visibleIds={visibleIds}
              currentUserId={currentUser.id}
              slots={slots}
              window={editableWindow}
              onDragCommit={handleWeekDragCommit}
            />
          )}
        </div>
      </main>

      <aside className={`${mobilePanel === "presets" ? "" : "hidden"} overflow-y-auto bg-background p-4 md:block`}>
        <PresetPanel
          userId={currentUser.id}
          presets={presets}
          activePresetId={activePresetId}
          onActivate={setActivePresetId}
          onPresetsChange={setPresets}
          preview={preview}
        />
      </aside>
      </div>
    </div>
  );
}
