import "server-only";
import { importPKCS8, SignJWT } from "jose";

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

interface GoogleCalendarEventBody {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export type SyncResult =
  | { status: "synced" }
  | { status: "failed"; error: string };

let tokenCache: { token: string; expiresAt: number } | null = null;

function getConfig(): { credentials: ServiceAccountCredentials; calendarId: string } | null {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!b64 || !calendarId) return null;
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return { credentials: json as ServiceAccountCredentials, calendarId };
  } catch {
    return null;
  }
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

async function parseTokenError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const json = JSON.parse(text) as { error?: unknown; error_description?: unknown };
    const error = typeof json.error === "string" ? json.error.slice(0, 100) : "";
    const desc = typeof json.error_description === "string" ? json.error_description.slice(0, 400) : "";
    if (error) {
      return `Token exchange failed: ${res.status} ${error}${desc ? `: ${desc}` : ""}`;
    }
    return `Token exchange failed: ${res.status} ${text.slice(0, 500).replace(/[^\x20-\x7E]/g, "")}`;
  } catch {
    return `Token exchange failed: ${res.status}`;
  }
}

export async function getAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const key = await importPKCS8(creds.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/calendar.events",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(await parseTokenError(res));
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

export function resetTokenCache() {
  tokenCache = null;
}

export function appEventIdToGoogleId(uuid: string): string {
  return uuid.replace(/-/g, "");
}

export function toGoogleEvent(event: {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
}): GoogleCalendarEventBody {
  return {
    summary: event.title,
    ...(event.description ? { description: event.description } : {}),
    start: { dateTime: event.start_at, timeZone: "Asia/Tokyo" },
    end: { dateTime: event.end_at, timeZone: "Asia/Tokyo" },
  };
}

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

async function calendarFetch(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${CALENDAR_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

export async function upsertGoogleEvent(
  token: string,
  calendarId: string,
  appEventId: string,
  body: GoogleCalendarEventBody,
): Promise<void> {
  const googleId = appEventIdToGoogleId(appEventId);
  const calPath = `/calendars/${encodeURIComponent(calendarId)}`;

  let res = await calendarFetch(token, `${calPath}/events`, {
    method: "POST",
    body: JSON.stringify({ id: googleId, ...body }),
  });

  if (res.status === 409) {
    res = await calendarFetch(token, `${calPath}/events/${googleId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function deleteGoogleEvent(
  token: string,
  calendarId: string,
  appEventId: string,
): Promise<void> {
  const googleId = appEventIdToGoogleId(appEventId);
  const res = await calendarFetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${googleId}`,
    { method: "DELETE" },
  );

  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar delete error: ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function syncEventToGoogle(event: {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: string;
}): Promise<SyncResult> {
  const config = getConfig();
  if (!config) return { status: "failed", error: "Google Calendar sync not configured" };

  try {
    const token = await getAccessToken(config.credentials);

    if (event.status === "cancelled") {
      await deleteGoogleEvent(token, config.calendarId, event.id);
    } else {
      await upsertGoogleEvent(token, config.calendarId, event.id, toGoogleEvent(event));
    }

    return { status: "synced" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown sync error";
    return { status: "failed", error: message.slice(0, 500) };
  }
}

export function checkSyncPermission(params: {
  userId: string | null;
  isAllowed: boolean;
  eventCreatedBy: string;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!params.userId) return { ok: false, status: 401, error: "Unauthorized" };
  if (!params.isAllowed) return { ok: false, status: 403, error: "Forbidden" };
  if (params.eventCreatedBy !== params.userId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}
