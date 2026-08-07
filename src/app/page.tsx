import { redirect } from "next/navigation";
import { getDevPreviewData, isDevPreviewEnabled } from "@/lib/dev-auth";
import { EventCalendar } from "./events/event-calendar";

export default async function HomePage() {
  if (isDevPreviewEnabled()) {
    const { currentUser, events, participants, people } = getDevPreviewData();
    return <EventCalendar currentUser={currentUser} initialEvents={events} initialParticipants={participants} people={people} preview />;
  }
  redirect("/events");
}
