"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NicknameForm() {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      setError("1〜20文字で入力してください。");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("setup_profile", {
      p_nickname: trimmed,
    });

    if (error) {
      setError(
        error.code === "23505"
          ? "そのニックネームは既に使われています。"
          : "登録に失敗しました。もう一度お試しください。",
      );
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2 text-left">
        <Label htmlFor="nickname">ニックネーム</Label>
        <Input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder="例: たろう"
          autoFocus
        />
        <p className="text-muted-foreground text-xs">
          本名は使わないでください。他のメンバーにはこの名前だけが表示されます。
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "登録中..." : "はじめる"}
      </Button>
    </form>
  );
}
