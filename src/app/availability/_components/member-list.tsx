"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { SignOutButton } from "@/components/sign-out-button";
import type { Profile } from "@/lib/types";

export function MemberList({
  members,
  currentUserId,
  visibleIds,
  onToggle,
}: {
  members: Profile[];
  currentUserId: string;
  visibleIds: Set<string>;
  onToggle: (id: string) => void;
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
        {members.map((m) => (
          <li key={m.id}>
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
            </label>
          </li>
        ))}
      </ul>
      <SignOutButton variant="ghost" />
    </div>
  );
}
