import { LoginButton } from "./login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-accent/40 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-center shadow-lg">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">空き時間カレンダー</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            仲間内限定です。許可されたGoogleアカウントでログインしてください。
          </p>
        </div>
        <LoginButton next={next} />
      </div>
    </main>
  );
}
