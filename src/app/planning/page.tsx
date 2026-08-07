import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDevPlanningData, isDevPreviewEnabled } from "@/lib/dev-auth";
import { PlanningBoard } from "./_components/planning-board";

export default async function PlanningPage() {
  if (isDevPreviewEnabled()) return <PlanningBoard {...getDevPlanningData()} preview />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: currentUser }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, color").eq("id", user.id).single(),
    supabase.from("profiles").select("id, nickname, color").order("nickname"),
  ]);
  if (!currentUser) redirect("/setup-nickname");
  return <PlanningBoard currentUser={currentUser} members={members ?? []} />;
}
