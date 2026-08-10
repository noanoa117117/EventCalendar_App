"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SignOutButton } from "@/components/sign-out-button";
import type { Profile } from "@/lib/types";

export function MemberList({
  members,
  currentUserId,
  visibleIds,
  onToggle,
  registrationStatus,
}: {
  members: Profile[];
  currentUserId: string;
  visibleIds: Set<string>;
  onToggle: (id: string) => void;
  registrationStatus?: Map<string, { registered: number; total: number }>;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground">メンバー</h2>
        <p className="text-xs text-muted-foreground">
          チェックしたメンバーの空き時間を表示します
        </p>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {members.map((m) => {
          const status = registrationStatus?.get(m.id);
          const registered = status?.registered ?? 0;
          const total = status?.total ?? 0;
          const isPartial = registered > 0 && registered < total * 0.3;
          return <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox
                checked={visibleIds.has(m.id)}
                onCheckedChange={() => onToggle(m.id)}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              <span className="truncate text-sm">
                {m.nickname}
                {m.id === currentUserId && (
                  <span className="text-muted-foreground"> (自分)</span>
                )}
              </span>
              {status && registered === 0 && (
                <span className="ml-auto shrink-0 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning-foreground">未登録</span>
              )}
              {isPartial && (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"><span>{registered} / {total}日</span><span className="h-1 w-8 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={registered} aria-label={`${m.nickname} 登録状況`}><span className="block h-full bg-primary" style={{ width: `${(registered / (total || 1)) * 100}%` }} /></span></span>
              )}
            </label>
          </li>
        })}
      </ul>
      <SignOutButton variant="ghost" />
    </div>
  );
}
