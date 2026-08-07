function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col bg-border" role="status" aria-live="polite" aria-label="空き時間画面を読み込み中">
      <nav className="flex items-center gap-4 border-b bg-background px-4 py-3 text-sm"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-32" /></nav>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px md:grid-cols-[200px_1fr_260px]">
        <aside className="hidden bg-background p-4 md:block"><Skeleton className="mb-4 h-5 w-24" /><Skeleton className="h-40 w-full" /></aside>
        <section className="flex min-w-0 flex-col bg-background p-3"><div className="mb-3 flex items-center justify-between"><Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-20" /></div><Skeleton className="min-h-[520px] flex-1 rounded-lg" /></section>
        <aside className="hidden bg-background p-4 md:block"><Skeleton className="mb-4 h-5 w-36" /><Skeleton className="h-48 w-full" /></aside>
      </div>
      <span className="sr-only">読み込み中…</span>
    </main>
  );
}
