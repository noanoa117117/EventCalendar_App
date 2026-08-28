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
const previewPersonalEventId = "00000000-0000-4000-8000-000000000011";
const previewOtherUserId = "00000000-0000-4000-8000-000000000002";
const previewThirdUserId = "00000000-0000-4000-8000-000000000003";
const previewFourthUserId = "00000000-0000-4000-8000-000000000004";
const previewFifthUserId = "00000000-0000-4000-8000-000000000005";
const previewSixthUserId = "00000000-0000-4000-8000-000000000006";
const previewSeventhUserId = "00000000-0000-4000-8000-000000000007";
const previewEighthUserId = "00000000-0000-4000-8000-000000000008";
const previewNinthUserId = "00000000-0000-4000-8000-000000000009";

const previewCurrentUser: Profile = { id: previewUserId, nickname: "ローカルユーザー", color: "#2563eb" };
const previewPeople: Profile[] = [
  previewCurrentUser,
  { id: previewOtherUserId, nickname: "あお", color: "#16a34a" },
  { id: previewThirdUserId, nickname: "けん", color: "#ea580c" },
  { id: previewFourthUserId, nickname: "みき", color: "#7c3aed" },
  { id: previewFifthUserId, nickname: "りさ", color: "#db2777" },
  { id: previewSixthUserId, nickname: "たくみ", color: "#0891b2" },
  { id: previewSeventhUserId, nickname: "ゆい", color: "#ca8a04" },
  { id: previewEighthUserId, nickname: "はる", color: "#dc2626" },
  { id: previewNinthUserId, nickname: "なお", color: "#4f46e5" },
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
    is_personal: false,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
  },
  {
    id: previewPersonalEventId,
    title: "個人イベントのプレビュー",
    description: "本人だけに表示される予定です。",
    start_at: "2026-08-13T01:00:00.000Z",
    end_at: "2026-08-13T02:00:00.000Z",
    created_by: previewCurrentUser.id,
    status: "published",
    created_at: "2026-08-01T00:00:00.000Z",
    is_personal: true,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
  },
];

const previewParticipants: Participant[] = [
  { event_id: previewEventId, user_id: previewOtherUserId, status: "going", comment: null, updated_at: "2026-08-01T00:00:00.000Z" },
];

const previewPresets: Preset[] = [
  { id: "00000000-0000-4000-8000-000000000020", user_id: previewUserId, label: "平日夜", start_time: "20:00", end_time: "23:30", color: "#8b5cf6", sort_order: 0 },
  { id: "00000000-0000-4000-8000-000000000021", user_id: previewUserId, label: "午前", start_time: "09:00", end_time: "12:00", color: "#0ea5e9", sort_order: 1 },
  { id: "00000000-0000-4000-8000-000000000022", user_id: previewUserId, label: "終日", start_time: "09:00", end_time: "00:00", color: "#f59e0b", sort_order: 2 },
];
const previewSlots: Slot[] = [
  { id: "00000000-0000-4000-8000-000000000030", user_id: previewCurrentUser.id, date: "2026-08-10", start_time: "09:00", end_time: "12:00", preset_id: "00000000-0000-4000-8000-000000000021" },
  { id: "00000000-0000-4000-8000-000000000031", user_id: previewCurrentUser.id, date: "2026-08-11", start_time: "20:00", end_time: "23:30", preset_id: "00000000-0000-4000-8000-000000000020" },
  { id: "00000000-0000-4000-8000-000000000032", user_id: previewCurrentUser.id, date: "2026-08-12", start_time: "09:00", end_time: "12:00", preset_id: "00000000-0000-4000-8000-000000000021" },
  { id: "00000000-0000-4000-8000-000000000033", user_id: previewCurrentUser.id, date: "2026-08-12", start_time: "20:00", end_time: "23:30", preset_id: "00000000-0000-4000-8000-000000000020" },
  { id: "00000000-0000-4000-8000-000000000034", user_id: previewCurrentUser.id, date: "2026-08-13", start_time: "09:00", end_time: "00:00", preset_id: "00000000-0000-4000-8000-000000000022" },
  { id: "00000000-0000-4000-8000-000000000035", user_id: previewCurrentUser.id, date: "2026-08-14", start_time: "13:00", end_time: "15:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000036", user_id: previewOtherUserId, date: "2026-08-10", start_time: "10:00", end_time: "12:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000037", user_id: previewOtherUserId, date: "2026-08-11", start_time: "19:00", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000038", user_id: previewOtherUserId, date: "2026-08-12", start_time: "10:00", end_time: "12:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000039", user_id: previewOtherUserId, date: "2026-08-13", start_time: "14:00", end_time: "00:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000040", user_id: previewThirdUserId, date: "2026-08-10", start_time: "10:00", end_time: "11:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000041", user_id: previewThirdUserId, date: "2026-08-11", start_time: "20:30", end_time: "23:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000042", user_id: previewThirdUserId, date: "2026-08-12", start_time: "11:00", end_time: "13:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000043", user_id: previewThirdUserId, date: "2026-08-14", start_time: "18:00", end_time: "21:00", preset_id: null },
  // 8/11: all nine have a common 20:30–21:30 range, useful for full-match previews.
  { id: "00000000-0000-4000-8000-000000000044", user_id: previewFourthUserId, date: "2026-08-11", start_time: "20:00", end_time: "22:30", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000045", user_id: previewFifthUserId, date: "2026-08-11", start_time: "20:30", end_time: "23:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000046", user_id: previewSixthUserId, date: "2026-08-11", start_time: "19:30", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000047", user_id: previewSeventhUserId, date: "2026-08-11", start_time: "20:00", end_time: "23:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000048", user_id: previewEighthUserId, date: "2026-08-11", start_time: "20:30", end_time: "21:30", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000049", user_id: previewNinthUserId, date: "2026-08-11", start_time: "20:00", end_time: "22:00", preset_id: null },
  // 8/12: seven people overlap, while はる and なお are intentionally unregistered.
  { id: "00000000-0000-4000-8000-000000000050", user_id: previewCurrentUser.id, date: "2026-08-12", start_time: "20:00", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000051", user_id: previewOtherUserId, date: "2026-08-12", start_time: "20:00", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000052", user_id: previewThirdUserId, date: "2026-08-12", start_time: "20:30", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000053", user_id: previewFourthUserId, date: "2026-08-12", start_time: "20:00", end_time: "21:30", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000054", user_id: previewFifthUserId, date: "2026-08-12", start_time: "20:30", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000055", user_id: previewSixthUserId, date: "2026-08-12", start_time: "20:00", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000056", user_id: previewSeventhUserId, date: "2026-08-12", start_time: "20:30", end_time: "21:30", preset_id: null },
  // Mixed availability on 8/13 and 8/14 exercises sparse week rows and registration badges.
  { id: "00000000-0000-4000-8000-000000000057", user_id: previewFourthUserId, date: "2026-08-13", start_time: "18:00", end_time: "21:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000058", user_id: previewFifthUserId, date: "2026-08-13", start_time: "19:00", end_time: "22:00", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000059", user_id: previewSixthUserId, date: "2026-08-14", start_time: "18:30", end_time: "21:30", preset_id: null },
  { id: "00000000-0000-4000-8000-000000000060", user_id: previewEighthUserId, date: "2026-08-14", start_time: "20:00", end_time: "22:30", preset_id: null },
];

const previewPlanningSlots: Slot[] = [
  ...previewSlots,
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

export function addDevEvent(event: Omit<Event, "id" | "created_at" | "is_personal" | "google_sync_status" | "google_sync_error" | "google_synced_at">): Event {
  const created: Event = { ...event, id: crypto.randomUUID(), created_at: new Date().toISOString(), is_personal: false, google_sync_status: null, google_sync_error: null, google_synced_at: null };
  previewEvents.push(created);
  return created;
}
