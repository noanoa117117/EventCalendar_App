import { LoginButton } from "./login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">空き時間カレンダー</h1>
          <p className="text-muted-foreground text-sm">
            仲間内限定です。許可されたGoogleアカウントでログインしてください。
          </p>
        </div>
        <LoginButton next={next} />
      </div>
    </main>
  );
}
