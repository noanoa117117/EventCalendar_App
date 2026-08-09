import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCancellationEmail } from "@/lib/cancellation-email";

const dateLabel = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: allowed, error: allowedError } = await supabase.rpc("is_allowed_user");
  if (allowedError || !allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let eventId: string;
  try {
    const body = await request.json();
    eventId = body.eventId;
    if (typeof eventId !== "string" || !eventId) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let admin;
  try { admin = createAdminClient(); } catch {
    return NextResponse.json({ error: "Cancellation service unavailable" }, { status: 503 });
  }
  const { data: event, error } = await admin.rpc("cancel_event", { p_event_id: eventId, p_actor_id: user.id });
  if (error || !event) {
    const status = error?.message.includes("not authorized") || error?.message.includes("organizer") ? 403
      : error?.message.includes("published") ? 409 : 400;
    return NextResponse.json({ error: "Cancellation failed" }, { status });
  }

  const { data: notifications } = await admin.from("event_notifications")
    .select("id, user_id, event_title, event_start_at, event_end_at, organizer_id, attempts")
    .eq("event_id", eventId).eq("status", "pending");
  const { data: organizer } = await admin.from("profiles").select("nickname").eq("id", event.created_by).maybeSingle();

  let sent = 0;
  let failed = 0;
  for (const notification of notifications ?? []) {
    let reason = "email_not_found";
    let result: { ok: boolean; reason?: string } = { ok: false, reason };
    const { data: authUser } = await admin.auth.admin.getUserById(notification.user_id);
    if (authUser.user?.email) {
      result = await sendCancellationEmail(authUser.user.email, {
        title: notification.event_title,
        startAt: dateLabel(notification.event_start_at),
        endAt: dateLabel(notification.event_end_at),
        organizerName: organizer?.nickname,
      });
      reason = result.ok ? "" : result.reason ?? "send_failed";
    }
    const attempts = notification.attempts + 1;
    await admin.from("event_notifications").update({
      status: result.ok ? "sent" : "failed",
      attempts,
      sent_at: result.ok ? new Date().toISOString() : null,
      last_error: result.ok ? null : reason,
    }).eq("id", notification.id);
    if (result.ok) sent += 1; else failed += 1;
  }
  return NextResponse.json({ event, notifications: { total: (notifications ?? []).length, sent, failed } });
}
