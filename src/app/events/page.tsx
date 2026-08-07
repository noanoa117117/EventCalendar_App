import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCalendar } from "./event-calendar";

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: events }, { data: participants }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, color").eq("id", user.id).single(),
    supabase.from("events").select("id, title, description, start_at, end_at, created_by, status, created_at").order("start_at"),
    supabase.from("event_participants").select("event_id, user_id, status, comment, updated_at"),
  ]);
  if (!profile) redirect("/setup-nickname");

  const ids = Array.from(new Set((events ?? []).flatMap((event) => [event.created_by, ...(participants ?? []).filter((p) => p.event_id === event.id).map((p) => p.user_id)])));
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, nickname, color").in("id", ids)
    : { data: [] };

  return <EventCalendar currentUser={profile} initialEvents={events ?? []} initialParticipants={participants ?? []} people={people ?? []} />;
}
