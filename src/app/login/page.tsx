import { LoginButton } from "./login-button";

function isLocalSupabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "http:" &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const local = isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-accent/40 p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 text-center shadow-lg">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">空き時間カレンダー</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {local
              ? "ローカル環境です。fixture のメールアドレスとパスワード、またはGoogleでログインしてください。"
              : "仲間内限定です。許可されたGoogleアカウントでログインしてください。"}
          </p>
        </div>
        <LoginButton next={next} local={local} />
      </div>
    </main>
  );
}
