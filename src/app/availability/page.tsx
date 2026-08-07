import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDevAvailabilityData, isDevPreviewEnabled } from "@/lib/dev-auth";
import { AvailabilityBoard } from "./_components/availability-board";

export default async function AvailabilityPage() {
  if (isDevPreviewEnabled()) {
    const data = getDevAvailabilityData();
    return <AvailabilityBoard {...data} preview />;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth only - src/proxy.ts already redirects unauthenticated,
  // unwhitelisted, or nickname-less visitors before this page renders.
  if (!user) redirect("/login");

  const [{ data: profile }, { data: members }, { data: presets }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, nickname, color")
        .eq("id", user.id)
        .single(),
      supabase.from("profiles").select("id, nickname, color").order("nickname"),
      supabase
        .from("availability_presets")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
    ]);

  if (!profile) redirect("/setup-nickname");

  return (
    <AvailabilityBoard
      currentUser={profile}
      members={members ?? []}
      initialPresets={presets ?? []}
    />
  );
}
