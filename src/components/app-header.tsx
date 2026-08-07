"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const pages = [
  { key: "events", href: "/events", label: "カレンダー" },
  { key: "planning", href: "/planning", label: "企画" },
  { key: "availability", href: "/availability", label: "空き時間" },
] as const;

type PageKey = (typeof pages)[number]["key"];

export function AppHeader({
  current,
  children,
  onBeforeNavigate,
}: {
  current: PageKey;
  children?: ReactNode;
  onBeforeNavigate?: () => boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 shadow-sm md:px-8">
      <nav className="flex items-center gap-1 text-sm" aria-label="メインナビゲーション">
        {pages.map((p) =>
          p.key === current ? (
            <span key={p.key} className="rounded-md bg-muted px-2.5 py-1 font-medium">
              {p.label}
            </span>
          ) : (
            <Link
              key={p.key}
              href={p.href}
              onClick={(e) => {
                if (onBeforeNavigate && !onBeforeNavigate()) e.preventDefault();
              }}
              className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {p.label}
            </Link>
          ),
        )}
      </nav>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
