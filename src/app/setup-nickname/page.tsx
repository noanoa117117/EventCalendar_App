import { NicknameForm } from "./nickname-form";

export default function SetupNicknamePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">ニックネームを設定</h1>
          <p className="text-muted-foreground text-sm">
            初回ログイン時に一度だけ設定します。後から他の画面には進めません。
          </p>
        </div>
        <NicknameForm />
      </div>
    </main>
  );
}
