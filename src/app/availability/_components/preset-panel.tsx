"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { PresetDialog } from "./preset-dialog";
import { formatTimeLabel } from "@/lib/availability";
import type { Preset } from "@/lib/types";

export function PresetPanel({
  userId,
  presets,
  activePresetId,
  onActivate,
  onPresetsChange,
  preview = false,
}: {
  userId: string;
  presets: Preset[];
  activePresetId: string | null;
  onActivate: (id: string | null) => void;
  onPresetsChange: (presets: Preset[]) => void;
  preview?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Preset | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(p: Preset) {
    setEditing(p);
    setDialogOpen(true);
  }

  function handleSaved(saved: Preset) {
    const exists = presets.some((p) => p.id === saved.id);
    const next = exists
      ? presets.map((p) => (p.id === saved.id ? saved : p))
      : [...presets, saved];
    onPresetsChange(next.sort((a, b) => a.sort_order - b.sort_order));
  }

  function handleDeleted(id: string) {
    onPresetsChange(presets.filter((p) => p.id !== id));
    if (activePresetId === id) onActivate(null);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">プリセット</h2>
          <p className="text-xs text-muted-foreground">
            選んで日付をクリック/ドラッグ
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={openNew} aria-label="プリセットを追加">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ul className="flex-1 space-y-1.5 overflow-y-auto">
        {presets.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <Toggle
              pressed={activePresetId === p.id}
              onPressedChange={(pressed) => onActivate(pressed ? p.id : null)}
              className="h-auto flex-1 justify-start gap-2 px-2 py-1.5 data-[state=on]:bg-accent"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="flex flex-col items-start overflow-hidden">
                <span className="truncate text-sm leading-tight">{p.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {formatTimeLabel(p.start_time)}–{formatTimeLabel(p.end_time, true)}
                </span>
              </span>
            </Toggle>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => openEdit(p)}
              aria-label={`${p.label}を編集`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
        {presets.length === 0 && (
          <li className="text-sm text-muted-foreground">
            プリセットがありません。追加してください。
          </li>
        )}
      </ul>

      <PresetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        preset={editing}
        nextSortOrder={presets.length}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        preview={preview}
      />
    </div>
  );
}
