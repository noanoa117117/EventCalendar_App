"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [managerOpen, setManagerOpen] = useState(false);
  const [returnToManager, setReturnToManager] = useState(false);

  function openManager() {
    setManagerOpen(true);
  }

  function openNew(fromManager = false) {
    setEditing(null);
    setReturnToManager(fromManager);
    if (fromManager) setManagerOpen(false);
    setDialogOpen(true);
  }

  function openEdit(p: Preset, fromManager = false) {
    setEditing(p);
    setReturnToManager(fromManager);
    if (fromManager) setManagerOpen(false);
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
    <>
      <PresetDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && returnToManager) setManagerOpen(true);
        }}
        userId={userId}
        preset={editing}
        nextSortOrder={presets.length}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
        preview={preview}
      />
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>パターン管理</DialogTitle>
            <DialogDescription>パターンの追加・編集を行います。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,24rem)] space-y-1 overflow-y-auto">
            {presets.map((p) => {
              const editable = canEdit && p.user_id === userId;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => openEdit(p, true)}
                  title={!editable ? editDisabledHint : undefined}
                  className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTimeLabel(p.start_time)}–{formatTimeLabel(p.end_time, true)}
                  </span>
                </button>
              );
            })}
            {presets.length === 0 && <p className="text-sm text-muted-foreground">パターンがありません</p>}
          </div>
          {!canEdit && editDisabledHint && <p className="text-xs text-muted-foreground" role="status">{editDisabledHint}</p>}
          <Button type="button" onClick={() => openNew(true)} disabled={!canEdit} className="w-full">
            新しいパターンを追加
          </Button>
        </DialogContent>
      </Dialog>
    </>
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
                パターンを選び、日付をタップ
              </p>
            </div>
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
                </div>
              );
            })}
            {presets.length === 0 && (
              <p className="text-sm text-muted-foreground">パターンがありません</p>
            )}
            <Button type="button" variant="outline" onClick={openManager} className="w-full gap-1.5" aria-label="パターン管理">
              <Settings2 className="size-4" />
              パターン管理
            </Button>
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
              </li>
            ))}
            {presets.length === 0 && (
              <li className="text-sm text-muted-foreground">
                空き時間パターンがありません。追加してください。
              </li>
            )}
            {isHorizontalRail && (
              <li className="shrink-0">
                <Button size="sm" variant="outline" onClick={openManager} aria-label="パターン管理" className="h-full gap-1">
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>パターン管理</span>
                </Button>
              </li>
            )}
            {!isHorizontalRail && (
              <li className="shrink-0">
                <Button size="sm" variant="outline" onClick={openManager} aria-label="パターン管理" className="gap-1">
                  <Settings2 className="h-3.5 w-3.5" />
                  パターン管理
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
      <div className="hidden items-center justify-between gap-2 md:flex">
        <h2 className="text-sm font-semibold text-muted-foreground">空き時間パターン</h2>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">
        パターンを選び、日付をタップして空き時間を登録
      </p>
      {!canEdit && editDisabledHint && (
        <p className="hidden text-xs text-muted-foreground md:block" role="status">
          {editDisabledHint}
        </p>
      )}
      {!canEdit && editDisabledHint && (
        <p className="text-xs text-muted-foreground md:hidden" role="status">
          {editDisabledHint}
        </p>
      )}

      {/* Mobile: horizontal scrollable pill bar */}
      <div className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 md:hidden" role="listbox" aria-label="空き時間パターン">
        {presets.map((p) => {
          const active = activePresetId === p.id;
          return (
            <div key={p.id} className="flex min-w-0 max-w-[85vw] shrink-0 items-center gap-1">
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={!canActivate}
                onClick={() => onActivate(canActivate && !active ? p.id : null)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                style={{
                  borderColor: active ? p.color : undefined,
                  backgroundColor: active ? `${p.color}18` : "transparent",
                  boxShadow: active ? `0 0 0 1px ${p.color}` : undefined,
                }}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="truncate">{p.label}</span>
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={openManager}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40"
          aria-label="パターン管理"
        >
          <Settings2 className="size-3.5" />
          パターン管理
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
          </li>
        ))}
        {presets.length === 0 && (
          <li className="text-sm text-muted-foreground">
            空き時間パターンがありません。追加してください。
          </li>
        )}
        <li>
          <Button type="button" variant="outline" onClick={openManager} aria-label="パターン管理" className="w-full gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            パターン管理
          </Button>
        </li>
      </ul>

      {dialog}
    </div>
  );
}
