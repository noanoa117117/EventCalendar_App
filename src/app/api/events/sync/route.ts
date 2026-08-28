import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  syncEventToGoogle,
  isConfigured,
  checkSyncPermission,
} from "@/lib/google-calendar";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: allowed } = await supabase.rpc("is_allowed_user");
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let eventId: string;
  try {
    const body = await request.json();
    eventId = body.eventId;
    if (typeof eventId !== "string" || !eventId) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select(
      "id, title, description, start_at, end_at, created_by, status, is_personal",
    )
    .eq("id", eventId)
    .single();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const perm = checkSyncPermission({
    userId: user.id,
    isAllowed: !!allowed,
    eventCreatedBy: event.created_by,
  });
  if (!perm.ok) {
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }
  if (event.is_personal) {
    return NextResponse.json({ error: "Personal events cannot be synced" }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json({ status: "not_configured" });
  }

  await admin
    .from("events")
    .update({ google_sync_status: "pending", google_sync_error: null })
    .eq("id", eventId);

  const result = await syncEventToGoogle(event);

  if (result.status === "synced") {
    await admin
      .from("events")
      .update({
        google_sync_status: "synced",
        google_sync_error: null,
        google_synced_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    return NextResponse.json({ status: "synced" });
  }

  await admin
    .from("events")
    .update({
      google_sync_status: "failed",
      google_sync_error: result.error,
    })
    .eq("id", eventId);
  return NextResponse.json(
    { status: "failed", error: result.error },
    { status: 502 },
  );
}
