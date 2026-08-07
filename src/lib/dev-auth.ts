import type { Database } from "@/lib/database.types";
import type { Profile } from "@/lib/types";
import type { Preset, Slot } from "@/lib/types";

type Event = Database["public"]["Tables"]["events"]["Row"];
type Participant = Database["public"]["Tables"]["event_participants"]["Row"];

export function isDevPreviewEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_BYPASS_AUTH === "true";
}

const previewUserId = "00000000-0000-4000-8000-000000000001";
const previewEventId = "00000000-0000-4000-8000-000000000010";
const previewOtherUserId = "00000000-0000-4000-8000-000000000002";

const previewCurrentUser: Profile = { id: previewUserId, nickname: "ローカルユーザー", color: "#2563eb" };
const previewPeople: Profile[] = [
  previewCurrentUser,
  { id: previewOtherUserId, nickname: "プレビューメンバー", color: "#16a34a" },
];

const previewEvents: Event[] = [
  {
    id: previewEventId,
    title: "ローカルプレビューのイベント",
    description: "このイベントはブラウザ内の一時データです。",
    start_at: "2026-08-12T10:00:00.000Z",
    end_at: "2026-08-12T11:00:00.000Z",
    created_by: previewCurrentUser.id,
    status: "published",
    created_at: "2026-08-01T00:00:00.000Z",
  },
];

const previewParticipants: Participant[] = [
  { event_id: previewEventId, user_id: previewOtherUserId, status: "going", comment: null, updated_at: "2026-08-01T00:00:00.000Z" },
];

const previewPresets: Preset[] = [
  { id: "00000000-0000-4000-8000-000000000020", user_id: previewUserId, label: "平日夜", start_time: "20:00", end_time: "23:30", color: "#8b5cf6", sort_order: 0 },
];
const previewSlots: Slot[] = [
  { id: "00000000-0000-4000-8000-000000000030", user_id: previewOtherUserId, date: "2026-08-12", start_time: "10:00", end_time: "11:00", preset_id: null },
];

const previewPlanningSlots: Slot[] = [
  ...previewSlots,
  { id: "00000000-0000-4000-8000-000000000031", user_id: previewCurrentUser.id, date: "2026-08-12", start_time: "10:00", end_time: "12:00", preset_id: null },
];

export function getDevPreviewData() {
  return { currentUser: previewCurrentUser, people: previewPeople, events: previewEvents, participants: previewParticipants };
}

export function getDevAvailabilityData() {
  return { currentUser: previewCurrentUser, members: previewPeople, initialPresets: previewPresets, initialSlots: previewSlots };
}

export function getDevPlanningData() {
  return { currentUser: previewCurrentUser, members: previewPeople, initialSlots: previewPlanningSlots };
}

export function addDevEvent(event: Omit<Event, "id" | "created_at">): Event {
  const created: Event = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  previewEvents.push(created);
  return created;
}
