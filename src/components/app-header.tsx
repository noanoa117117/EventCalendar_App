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
    <header className="glass-nav sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:gap-3 md:px-8 md:py-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 md:contents">
      <nav className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1 text-sm md:flex md:w-auto md:bg-transparent md:p-0" aria-label="メインナビゲーション">
        {pages.map((p) =>
          p.key === current ? (
            <span key={p.key} className="rounded-md bg-background py-2 text-center font-medium shadow-sm md:bg-muted md:px-3 md:py-1 md:shadow-none">
              {p.label}
            </span>
          ) : (
            <Link
              key={p.key}
              href={p.href}
              onClick={(e) => {
                if (onBeforeNavigate && !onBeforeNavigate()) e.preventDefault();
              }}
              className="rounded-md py-2 text-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:px-3 md:py-1"
            >
              {p.label}
            </Link>
          ),
        )}
      </nav>
      {children && <div className="relative z-10 flex w-full items-center justify-end gap-2 md:w-auto">{children}</div>}
      </div>
    </header>
  );
}
