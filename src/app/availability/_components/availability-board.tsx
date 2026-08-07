"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, X, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  jstNow,
  monthGridRange,
  registrableWindow,
  weekRange,
  applyAvailabilityOperations,
} from "@/lib/availability";
import type { AvailabilityOperation } from "@/lib/availability";
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
  compact = false,
  onAvailabilityChanged,
}: {
  currentUser: Profile;
  members: Profile[];
  initialPresets: Preset[];
  initialSlots?: Slot[];
  preview?: boolean;
  compact?: boolean;
  onAvailabilityChanged?: () => void;
}) {
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [cursorDate, setCursorDate] = useState<Date>(() => jstNow());
  const [visibleIds, setVisibleIds] = useState<Set<string>>(
    () => new Set([currentUser.id]),
  );
  const [presets, setPresets] = useState<Preset[]>(initialPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [serverSlots, setServerSlots] = useState<Slot[]>(initialSlots);
  const [draftOps, setDraftOps] = useState<AvailabilityOperation[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteMonthDialogOpen, setDeleteMonthDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const fetchGeneration = useRef(0);

  const selfVisible = visibleIds.has(currentUser.id);
  const hasDraft = draftOps.length > 0;
  const projectedSlots = useMemo(
    () => applyAvailabilityOperations(serverSlots, draftOps, currentUser.id),
    [serverSlots, draftOps, currentUser.id],
  );

  const editableWindow = useMemo(() => registrableWindow(), []);
  const deletableMonthDates = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(cursorDate), end: endOfMonth(cursorDate) })
      .map((date) => format(date, "yyyy-MM-dd"))
      .filter((date) => date >= editableWindow.min && date <= editableWindow.max),
    [cursorDate, editableWindow],
  );
  const canActivatePreset = editing && selfVisible;
  const activePreset = canActivatePreset ? presets.find((p) => p.id === activePresetId) ?? null : null;

  const range = useMemo(
    () => (viewMode === "month" ? monthGridRange(cursorDate) : weekRange(cursorDate)),
    [viewMode, cursorDate],
  );

  const fetchSlots = useCallback(async () => {
    if (preview) return;
    const generation = ++fetchGeneration.current;
    if (visibleIds.size === 0) {
      setLoading(false);
      setServerSlots([]);
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
    setServerSlots(data ?? []);
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

  function handlePaint(dates: string[], action: "apply" | "remove", preset: Preset) {
    if (!editing || !selfVisible) return;
    setDraftOps((prev) => [...prev, { dates, start: preset.start_time, end: preset.end_time, active: action === "apply", presetId: action === "apply" ? preset.id : null }]);
  }

  function handleWeekDragCommit(
    date: string,
    start: string,
    end: string,
    action: "apply" | "remove",
  ) {
    if (!editing || !selfVisible) return;
    setDraftOps((prev) => [...prev, { dates: [date], start, end, active: action === "apply", presetId: null }]);
  }

  function stageDeleteMonth() {
    if (!editing || !selfVisible || confirming || deletableMonthDates.length === 0) return;
    setDraftOps((prev) => [
      ...prev,
      { dates: deletableMonthDates, start: "00:00", end: "00:00", active: false, presetId: null },
    ]);
    setDeleteMonthDialogOpen(false);
  }

  async function confirmDraft() {
    if (!hasDraft || confirming) return;
    setConfirming(true);
    if (preview) {
      setServerSlots(projectedSlots);
      setDraftOps([]); setActivePresetId(null); setEditing(false); setConfirming(false); onAvailabilityChanged?.(); return;
    }
    const { error } = await createClient().rpc("set_availability_batch", { p_operations: draftOps });
    if (error) { toast.error("空き時間の更新に失敗しました。変更は保持されています。"); setConfirming(false); return; }
    setDraftOps([]); setActivePresetId(null); setEditing(false); setConfirming(false); await fetchSlots(); onAvailabilityChanged?.();
  }

  function cancelDraft() { if (hasDraft && !window.confirm("未保存の変更を取り消しますか？")) return; setDraftOps([]); setActivePresetId(null); setEditing(false); }
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) { if (hasDraft) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasDraft]);

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

  const [mobilePanel, setMobilePanel] = useState<"calendar" | "members">("calendar");
  return (
    <div className={`flex ${compact ? "h-full min-h-[520px]" : "h-dvh"} flex-col bg-border`}>
      {preview && !compact && <div className="bg-amber-500/15 px-3 py-1.5 text-center text-xs font-medium text-amber-800">ローカルモック（Supabaseには接続しません）</div>}
      {!compact && <AppHeader current="availability" onBeforeNavigate={() => !hasDraft || window.confirm("未保存の変更があります。移動しますか？")} />}
      <div className={`flex items-center border-b bg-background px-3 py-2 ${compact ? "" : "md:hidden"}`}>
        <Tabs value={mobilePanel} onValueChange={(v) => setMobilePanel(v as typeof mobilePanel)} className="flex-1">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="calendar">カレンダー</TabsTrigger><TabsTrigger value="members">メンバー</TabsTrigger></TabsList>
        </Tabs>
      </div>
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-px bg-border ${mobilePanel === "calendar"
        ? "grid-rows-[minmax(0,1fr)_auto]"
        : "grid-rows-[minmax(0,1fr)]"} ${compact ? "" : "md:grid-cols-[200px_1fr_260px] md:grid-rows-1"}`}>
      <aside className={`${mobilePanel === "members" ? "" : "hidden"} min-h-0 overflow-y-auto bg-background p-4 ${compact ? "" : "md:block"}`}>
        <MemberList
          members={members}
          currentUserId={currentUser.id}
          visibleIds={visibleIds}
          onToggle={toggleMember}
        />
      </aside>

      <main className={`${mobilePanel === "calendar" ? "" : "hidden"} flex min-h-0 min-w-0 flex-col overflow-hidden bg-background ${compact ? "" : "md:flex"}`}>
        <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <div className="flex flex-wrap items-center gap-1">
            <Link href="/events" onClick={(e) => { if (hasDraft && !window.confirm("未保存の変更があります。移動しますか？")) e.preventDefault(); }} className="mr-1 hidden md:block"><Button size="icon" variant="ghost" aria-label="イベントカレンダーへ戻る"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <Button size="icon" variant="ghost" onClick={() => { if (hasDraft && !window.confirm("未保存の変更があります。移動しますか？")) return; goPrev(); }} aria-label="前へ">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { if (hasDraft && !window.confirm("未保存の変更があります。移動しますか？")) return; goNext(); }} aria-label="次へ">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { if (hasDraft && !window.confirm("未保存の変更があります。移動しますか？")) return; goToday(); }}>
              今日
            </Button>
            </div>
            <div className="min-w-0 basis-full md:flex-1"><h1 className="text-sm font-semibold">空き時間を登録・確認</h1><p className="text-xs text-muted-foreground">あなたの空き時間を登録し、選択したメンバーの空き時間を確認できます。</p><p className="text-xs text-muted-foreground">{title}</p></div>
            <div className="flex w-full flex-wrap items-center gap-1 md:w-auto">
              {loading && <span className="text-xs text-muted-foreground">更新中...</span>}
              {!editing && <Button className="shrink-0" size="sm" variant="outline" disabled={!selfVisible} onClick={() => setEditing(true)}>編集する</Button>}
              {editing && <><span className="text-xs text-amber-700">{hasDraft ? `未保存の変更あり (${draftOps.length})` : "編集モード"}</span>{viewMode === "month" && <Button className="shrink-0" size="sm" variant="destructive" disabled={!selfVisible || confirming || deletableMonthDates.length === 0} onClick={() => setDeleteMonthDialogOpen(true)}>この月を全削除</Button>}<Button className="shrink-0" size="sm" disabled={!hasDraft || confirming} onClick={confirmDraft}>{confirming ? "保存中…" : "変更を確定"}</Button><Button className="shrink-0" size="sm" variant="ghost" disabled={confirming} onClick={cancelDraft}>取り消す</Button></>}
              <Tabs className="shrink-0" value={viewMode} onValueChange={(v) => setViewMode(v as "month" | "week")}>
                <TabsList>
                  <TabsTrigger value="month">月</TabsTrigger>
                  <TabsTrigger value="week">週</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        <Dialog open={deleteMonthDialogOpen} onOpenChange={setDeleteMonthDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title}の空き時間をすべて削除しますか？</DialogTitle>
              <DialogDescription>
                {title}のうち編集可能な日付について、あなた自身の空き時間だけを削除します。他のメンバーの空き時間には影響しません。実際の削除は「変更を確定」を押すまでサーバーに反映されません。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteMonthDialogOpen(false)}>キャンセル</Button>
              <Button variant="destructive" disabled={confirming || deletableMonthDates.length === 0} onClick={stageDeleteMonth}>削除を下書き</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {activePreset && (
          <div
            className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm"
            style={{ backgroundColor: `${activePreset.color}22` }}
          >
            <span>
              「{activePreset.label}」を選択中。カレンダーの日付をクリック／ドラッグすると、あなたの空き時間を登録できます。同じ操作をもう一度すると解除します。
            </span>
            <Button size="sm" variant="ghost" onClick={() => setActivePresetId(null)}>
              <X className="mr-1 h-3.5 w-3.5" />
              終了 (Esc)
            </Button>
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {viewMode === "month" ? (
            <MonthCalendar
              cursorDate={cursorDate}
              members={members}
              visibleIds={visibleIds}
              currentUserId={currentUser.id}
              slots={projectedSlots}
              activePreset={activePreset}
              presets={presets}
              canEdit={editing && selfVisible}
              window={editableWindow}
              onPaint={handlePaint}
            />
          ) : (
            <WeekCalendar
              cursorDate={cursorDate}
              members={members}
              visibleIds={visibleIds}
              currentUserId={currentUser.id}
              slots={projectedSlots}
              window={editableWindow}
              onDragCommit={handleWeekDragCommit}
              canEdit={editing && selfVisible}
            />
          )}
          {loading && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
              role="status"
              aria-live="polite"
              aria-label="空き時間を読み込み中"
            >
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
                <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" aria-hidden="true" />
                空き時間を読み込み中…
              </div>
            </div>
          )}
        </div>

      </main>

      <aside className={`${mobilePanel === "calendar" ? "min-h-0 overflow-y-auto border-t p-3 md:border-t-0" : "hidden"} bg-background ${compact ? "max-h-40" : "md:block md:p-4"}`}>
        <PresetPanel
          userId={currentUser.id}
          presets={presets}
          activePresetId={activePresetId}
          onActivate={setActivePresetId}
          onPresetsChange={setPresets}
          preview={preview}
          canEdit={selfVisible && !hasDraft && !confirming}
          canActivate={canActivatePreset}
          inline={compact}
          horizontal={compact}
          editDisabledHint={hasDraft || confirming
            ? "未保存の変更を確定または取り消すまで、パターンの追加・編集・削除はできません。"
            : !selfVisible
              ? "自分を表示すると、パターンを追加・編集・削除できます。"
              : undefined}
        />
      </aside>
      </div>
    </div>
  );
}
