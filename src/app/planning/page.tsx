import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDevPlanningData, isDevPreviewEnabled } from "@/lib/dev-auth";
import type { ActiveProfile } from "@/lib/database.types";
import { PlanningBoard } from "./_components/planning-board";

export default async function PlanningPage() {
  if (isDevPreviewEnabled()) return <PlanningBoard {...getDevPlanningData()} preview />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: currentUser }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, color").eq("id", user.id).single(),
    supabase.rpc("list_active_profiles"),
  ]);
  if (!currentUser) redirect("/setup-nickname");
  return <PlanningBoard currentUser={currentUser} members={(members ?? []) as ActiveProfile[]} />;
}
