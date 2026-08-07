import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDevAvailabilityData, getDevPreviewData, getDevPlanningData, isDevPreviewEnabled } from "@/lib/dev-auth";
import { Dashboard } from "./dashboard/dashboard";

export default async function HomePage() {
  if (isDevPreviewEnabled()) {
    const planning = getDevPlanningData();
    const availability = getDevAvailabilityData();
    const events = getDevPreviewData();
    return <Dashboard currentUser={planning.currentUser} members={planning.members} slots={planning.initialSlots} presets={availability.initialPresets} events={events.events} participants={events.participants} preview />;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: currentUser }, { data: members }, { data: events }, { data: participants }, { data: presets }, { data: slots }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, color").eq("id", user.id).single(),
    supabase.from("profiles").select("id, nickname, color").order("nickname"),
    supabase.from("events").select("id, title, description, start_at, end_at, created_by, status, created_at").order("start_at"),
    supabase.from("event_participants").select("event_id, user_id, status, comment, updated_at"),
    supabase.from("availability_presets").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("availability_slots").select("*").eq("user_id", user.id),
  ]);
  if (!currentUser) redirect("/setup-nickname");
  return <Dashboard currentUser={currentUser} members={members ?? []} slots={slots ?? []} presets={presets ?? []} events={events ?? []} participants={participants ?? []} />;
}
