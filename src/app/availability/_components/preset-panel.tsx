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
  canEdit = true,
  canActivate = true,
  inline = false,
  horizontal = false,
  editDisabledHint,
}: {
  userId: string;
  presets: Preset[];
  activePresetId: string | null;
  onActivate: (id: string | null) => void;
  onPresetsChange: (presets: Preset[]) => void;
  preview?: boolean;
  canEdit?: boolean;
  canActivate?: boolean;
  inline?: boolean;
  horizontal?: boolean;
  editDisabledHint?: string;
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

  const dialog = (
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
  );
  const isHorizontalRail = horizontal;

  if (inline) {
    return (
      <>
        <div className={`flex min-h-0 flex-col gap-1.5 md:h-full md:gap-3 ${horizontal ? "max-h-40" : ""}`}>
          {/* Desktop: full header */}
          <div className="hidden md:flex md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground">空き時間パターン</h2>
              <p className="text-xs text-muted-foreground">
                パターンを選び、日付をクリック／ドラッグ
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openNew} disabled={!canEdit} aria-label="空き時間パターンを追加" className="shrink-0 gap-1">
              <Plus className="h-3.5 w-3.5" />
              <span>追加</span>
            </Button>
          </div>
          {!canEdit && editDisabledHint && (
            <p className="hidden text-xs text-muted-foreground md:block" role="status">
              {editDisabledHint}
            </p>
          )}

          {/* Mobile: compact vertical list */}
          {!isHorizontalRail && <div className="flex flex-col gap-1.5 md:hidden" role="listbox" aria-label="空き時間パターン">
            {presets.map((p) => {
              const active = activePresetId === p.id;
              return (
                <div key={p.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={!canActivate}
                    onClick={() => onActivate(canActivate && !active ? p.id : null)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{
                      borderColor: active ? p.color : undefined,
                      backgroundColor: active ? `${p.color}14` : "transparent",
                      boxShadow: active ? `0 0 0 1px ${p.color}` : undefined,
                    }}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="truncate">{p.label}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatTimeLabel(p.start_time)}–{formatTimeLabel(p.end_time, true)}
                    </span>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => openEdit(p)}
                    disabled={!canEdit || p.user_id !== userId}
                    aria-label={`${p.label}を編集`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            {presets.length === 0 && (
              <p className="text-sm text-muted-foreground">パターンがありません</p>
            )}
            <button
              type="button"
              onClick={openNew}
              disabled={!canEdit}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
              aria-label="パターンを追加"
            >
              <Plus className="size-4" />
              追加
            </button>
          </div>}

          {/* Desktop: vertical list */}
          <ul className={horizontal
            ? "flex min-w-0 gap-1.5 overflow-x-auto pb-1"
            : "hidden md:flex md:flex-1 md:flex-col md:space-y-1.5 md:overflow-y-auto"}>
            {presets.map((p) => (
              <li key={p.id} className={`flex items-center gap-1 ${isHorizontalRail ? "min-w-max shrink-0" : ""}`}>
                <Toggle
                  pressed={activePresetId === p.id}
                  onPressedChange={(pressed) => onActivate(canActivate && pressed ? p.id : null)}
                  disabled={!canActivate}
                  className="h-auto flex-1 justify-start gap-2 px-2 py-1.5 data-[state=on]:bg-accent"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
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
                  disabled={!canEdit || p.user_id !== userId}
                  aria-label={`${p.label}を編集`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {presets.length === 0 && (
              <li className="text-sm text-muted-foreground">
                空き時間パターンがありません。追加してください。
              </li>
            )}
            {isHorizontalRail && (
              <li className="shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openNew}
                  disabled={!canEdit}
                  aria-label="空き時間パターンを追加"
                  className="h-full gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>追加</span>
                </Button>
              </li>
            )}
          </ul>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 md:gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">空き時間パターン</h2>
        <Button size="sm" variant="outline" onClick={openNew} disabled={!canEdit} aria-label="空き時間パターンを追加" className="shrink-0 gap-1">
          <Plus className="h-3.5 w-3.5" />
          <span>追加</span>
        </Button>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">
        パターンを選び、日付をクリック／ドラッグしてあなたの空き時間を登録
      </p>
      {!canEdit && editDisabledHint && (
        <p className="text-xs text-muted-foreground" role="status">
          {editDisabledHint}
        </p>
      )}

      {/* Mobile: card-style buttons */}
      <div className="flex flex-col gap-1.5 md:hidden" role="listbox" aria-label="空き時間パターン">
        {presets.map((p) => {
          const active = activePresetId === p.id;
          return (
            <div key={p.id} className="flex items-center gap-1">
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={!canActivate}
                onClick={() => onActivate(canActivate && !active ? p.id : null)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: active ? p.color : undefined,
                  backgroundColor: active ? `${p.color}14` : "transparent",
                  boxShadow: active ? `0 0 0 1px ${p.color}` : undefined,
                }}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="truncate">{p.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatTimeLabel(p.start_time)}–{formatTimeLabel(p.end_time, true)}
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => openEdit(p)}
                disabled={!canEdit || p.user_id !== userId}
                aria-label={`${p.label}を編集`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        {presets.length === 0 && (
          <p className="text-sm text-muted-foreground">パターンがありません</p>
        )}
        <button
          type="button"
          onClick={openNew}
          disabled={!canEdit}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
          aria-label="パターンを追加"
        >
          <Plus className="size-4" />
          追加
        </button>
      </div>

      {/* Desktop: toggle list */}
      <ul className="hidden flex-1 space-y-1.5 overflow-y-auto md:block">
        {presets.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <Toggle
              pressed={activePresetId === p.id}
              onPressedChange={(pressed) => onActivate(canActivate && pressed ? p.id : null)}
              disabled={!canActivate}
              className="h-auto flex-1 justify-start gap-2 px-2 py-1.5 data-[state=on]:bg-accent"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
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
              disabled={!canEdit || p.user_id !== userId}
              aria-label={`${p.label}を編集`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
        {presets.length === 0 && (
          <li className="text-sm text-muted-foreground">
            空き時間パターンがありません。追加してください。
          </li>
        )}
      </ul>

      {dialog}
    </div>
  );
}
