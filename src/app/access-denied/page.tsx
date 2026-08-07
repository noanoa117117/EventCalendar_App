import { SignOutButton } from "@/components/sign-out-button";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">アクセスできません</h1>
          <p className="text-muted-foreground text-sm">
            このGoogleアカウントは利用を許可されていません。
            管理者に招待を依頼するか、別のアカウントでログインし直してください。
          </p>
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
