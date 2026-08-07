function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <main className="min-h-dvh bg-muted/20" role="status" aria-live="polite" aria-label="イベント企画画面を読み込み中">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 md:px-8"><div><Skeleton className="mb-2 h-6 w-72" /><Skeleton className="h-3 w-96 max-w-full" /></div><Skeleton className="h-4 w-56" /></header>
      <div className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[200px_1fr_280px] md:p-8"><Skeleton className="h-56 rounded-xl" /><Skeleton className="h-[min(70vh,680px)] rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
      <span className="sr-only">読み込み中…</span>
    </main>
  );
}
