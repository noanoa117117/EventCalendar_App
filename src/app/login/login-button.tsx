"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";

export function LoginButton({ next, local }: { next?: string; local: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function callbackUrl() {
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    return redirectTo;
  }

  async function handlePasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("メールアドレスまたはパスワードが違います。");
      setLoading(false);
      return;
    }

    // Keep local password login on the same callback/next path.
    window.location.assign(callbackUrl().toString());
  }

  return (
    <div className="space-y-3">
      {!local && <a className={`${buttonVariants()} w-full`} href={`/auth/cloudflare${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Cloudflare Accessでログイン</a>}
      {local && (
        <>
          <form onSubmit={handlePasswordLogin} className="space-y-2 text-left">
            <label htmlFor="login-email" className="sr-only">メールアドレス</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="fixture-alice@example.test"
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
            />
            <label htmlFor="login-password" className="sr-only">パスワード</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="パスワード"
              className="h-10 w-full rounded-md border bg-transparent px-3 text-sm"
            />
            <Button type="submit" disabled={loading} variant="secondary" className="w-full">
              {loading ? "ログイン中..." : "メールでログイン"}
            </Button>
          </form>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
