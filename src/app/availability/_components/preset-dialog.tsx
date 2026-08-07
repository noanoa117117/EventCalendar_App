"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { Preset } from "@/lib/types";

const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function PresetDialog({
  open,
  onOpenChange,
  userId,
  preset,
  nextSortOrder,
  onSaved,
  onDeleted,
  preview = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  preset: Preset | null;
  nextSortOrder: number;
  onSaved: (preset: Preset) => void;
  onDeleted: (id: string) => void;
  preview?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed on the target preset so every open (add vs. edit vs. a
            different preset) mounts a fresh form seeded from props,
            instead of an effect resetting state after the fact. */}
        {open && (
          <PresetForm
            key={preset?.id ?? "new"}
            userId={userId}
            preset={preset}
            nextSortOrder={nextSortOrder}
            onSaved={(p) => {
              onSaved(p);
              onOpenChange(false);
            }}
            onDeleted={(id) => {
              onDeleted(id);
              onOpenChange(false);
            }}
            preview={preview}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PresetForm({
  userId,
  preset,
  nextSortOrder,
  onSaved,
  onDeleted,
  preview,
}: {
  userId: string;
  preset: Preset | null;
  nextSortOrder: number;
  onSaved: (preset: Preset) => void;
  onDeleted: (id: string) => void;
  preview?: boolean;
}) {
  const initialMidnight = preset ? preset.end_time.slice(0, 5) === "00:00" : false;

  const [label, setLabel] = useState(preset?.label ?? "");
  const [startTime, setStartTime] = useState(preset?.start_time.slice(0, 5) ?? "20:00");
  const [endTime, setEndTime] = useState(
    preset && !initialMidnight ? preset.end_time.slice(0, 5) : "23:30",
  );
  const [endIsMidnight, setEndIsMidnight] = useState(initialMidnight);
  const [color, setColor] = useState(preset?.color ?? PALETTE[nextSortOrder % PALETTE.length]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      setError("1〜30文字で入力してください。");
      return;
    }
    const end = endIsMidnight ? "00:00" : endTime;
    if (!endIsMidnight && startTime >= end) {
      setError("終了時刻は開始時刻より後にしてください。");
      return;
    }

    setSaving(true);
    setError(null);
    if (preview) {
      onSaved({ id: preset?.id ?? `preview-preset-${Date.now()}`, user_id: userId, label: trimmed, start_time: startTime, end_time: end, color, sort_order: preset?.sort_order ?? nextSortOrder });
      setSaving(false);
      return;
    }
    const supabase = createClient();

    if (preset) {
      const { data, error } = await supabase
        .from("availability_presets")
        .update({ label: trimmed, start_time: startTime, end_time: end, color })
        .eq("id", preset.id)
        .select()
        .single();
      setSaving(false);
      if (error || !data) {
        setError("保存に失敗しました。");
        return;
      }
      onSaved(data);
    } else {
      const { data, error } = await supabase
        .from("availability_presets")
        .insert({
          user_id: userId,
          label: trimmed,
          start_time: startTime,
          end_time: end,
          color,
          sort_order: nextSortOrder,
        })
        .select()
        .single();
      setSaving(false);
      if (error || !data) {
        setError("保存に失敗しました。");
        return;
      }
      onSaved(data);
    }
  }

  async function handleDelete() {
    if (!preset) return;
    setSaving(true);
    if (preview) { onDeleted(preset.id); setSaving(false); return; }
    const supabase = createClient();
    const { error } = await supabase
      .from("availability_presets")
      .delete()
      .eq("id", preset.id);
    setSaving(false);
    if (error) {
      toast.error("削除に失敗しました。");
      return;
    }
    onDeleted(preset.id);
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{preset ? "空き時間パターンを編集" : "空き時間パターンを追加"}</DialogTitle>
        <DialogDescription>
          30分単位の時間帯パターンです。作成・編集後にパターンを選び、日付をタップして空き時間を登録できます。すでに登録済みの空き時間には影響しません。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="preset-label">ラベル</Label>
          <Input
            id="preset-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
            placeholder="例: 平日夜"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="preset-start">開始</Label>
            <Input
              id="preset-start"
              type="time"
              step={1800}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-end">終了</Label>
            <Input
              id="preset-end"
              type="time"
              step={1800}
              value={endTime}
              disabled={endIsMidnight}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={endIsMidnight}
            onCheckedChange={(v) => setEndIsMidnight(v === true)}
          />
          24:00（その日の終わり）まで
        </label>

        <div className="space-y-2">
          <Label>色</Label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full ring-offset-2 ring-offset-background"
                style={{
                  backgroundColor: c,
                  boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                  outline: color === c ? "2px solid var(--ring)" : undefined,
                  outlineOffset: 2,
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {preset ? (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
            削除
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogFooter>
    </form>
  );
}
