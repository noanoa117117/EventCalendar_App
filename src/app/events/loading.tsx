function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <main className="min-h-dvh bg-muted/20" role="status" aria-live="polite" aria-label="イベントカレンダーを読み込み中">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:px-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-56" />
      </header>
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-4 flex items-center justify-between"><Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-24" /></div>
        <Skeleton className="h-[min(70vh,680px)] w-full rounded-xl" />
        <span className="sr-only">読み込み中…</span>
      </div>
    </main>
  );
}
