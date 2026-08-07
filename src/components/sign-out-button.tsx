"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  variant = "outline",
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/cloudflare/logout");
  }

  return (
    <Button variant={variant} onClick={handleSignOut} disabled={loading}>
      {loading ? "ログアウト中..." : "ログアウト"}
    </Button>
  );
}
