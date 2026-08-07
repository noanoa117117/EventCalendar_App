import { notFound } from "next/navigation";
import { EventCalendar } from "@/app/events/event-calendar";
import { getDevPreviewData, isDevPreviewEnabled } from "@/lib/dev-auth";
import { getDevAvailabilityData } from "@/lib/dev-auth";
import { AvailabilityBoard } from "@/app/availability/_components/availability-board";

export default async function DevPreviewPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  if (!isDevPreviewEnabled()) notFound();
  // The proxy preserves the requested preview kind when rewriting /availability.
  const params = await searchParams;
  if (params.preview === "availability") {
    return <AvailabilityBoard {...getDevAvailabilityData()} preview />;
  }
  const { currentUser, events, participants, people } = getDevPreviewData();
  return <EventCalendar currentUser={currentUser} initialEvents={events} initialParticipants={participants} people={people} preview />;
}
