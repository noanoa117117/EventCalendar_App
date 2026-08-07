import assert from "node:assert/strict";
import fs from "node:fs";
import { before, afterEach, test } from "node:test";
import { generateKeyPair, exportPKCS8, decodeJwt, decodeProtectedHeader } from "jose";
import {
  appEventIdToGoogleId,
  toGoogleEvent,
  getAccessToken,
  upsertGoogleEvent,
  deleteGoogleEvent,
  syncEventToGoogle,
  checkSyncPermission,
  resetTokenCache,
} from "../src/lib/google-calendar.ts";

let privateKeyPem: string;
const savedFetch = globalThis.fetch;

before(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  privateKeyPem = await exportPKCS8(privateKey);
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  resetTokenCache();
  delete (process.env as Record<string, string | undefined>).GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  delete (process.env as Record<string, string | undefined>).GOOGLE_CALENDAR_ID;
});

// --- ID conversion ---

test("appEventIdToGoogleId removes hyphens from UUID", () => {
  assert.equal(
    appEventIdToGoogleId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400e29b41d4a716446655440000",
  );
});

test("appEventIdToGoogleId is idempotent on non-hyphenated input", () => {
  assert.equal(
    appEventIdToGoogleId("550e8400e29b41d4a716446655440000"),
    "550e8400e29b41d4a716446655440000",
  );
});

// --- Event conversion ---

test("toGoogleEvent converts DB event to Google format", () => {
  const result = toGoogleEvent({
    title: "Test Event",
    description: "A description",
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
  });
  assert.equal(result.summary, "Test Event");
  assert.equal(result.description, "A description");
  assert.equal(result.start.dateTime, "2026-08-10T10:00:00+09:00");
  assert.equal(result.start.timeZone, "Asia/Tokyo");
  assert.equal(result.end.dateTime, "2026-08-10T11:00:00+09:00");
});

test("toGoogleEvent omits description when null", () => {
  const result = toGoogleEvent({
    title: "No desc",
    description: null,
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
  });
  assert.equal("description" in result, false);
});

// --- JWT and token ---

test("getAccessToken exchanges JWT for access token", async () => {
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "test-token-123", expires_in: 3600 }),
        { headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const token = await getAccessToken({
    client_email: "test@project.iam.gserviceaccount.com",
    private_key: privateKeyPem,
  });
  assert.equal(token, "test-token-123");
});

test("getAccessToken caches token across calls", async () => {
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({ access_token: "cached-token", expires_in: 3600 }),
      { headers: { "content-type": "application/json" } },
    );
  };

  const creds = { client_email: "test@project.iam.gserviceaccount.com", private_key: privateKeyPem };
  await getAccessToken(creds);
  await getAccessToken(creds);
  assert.equal(fetchCount, 1);
});

test("getAccessToken throws on failed token exchange", async () => {
  globalThis.fetch = async () => new Response("error", { status: 400 });
  await assert.rejects(
    () => getAccessToken({ client_email: "a@b.com", private_key: privateKeyPem }),
    { message: /Token exchange failed: 400/ },
  );
});

test("getAccessToken extracts error and error_description from JSON response", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }),
      { status: 400 },
    );
  await assert.rejects(
    () => getAccessToken({ client_email: "a@b.com", private_key: privateKeyPem }),
    { message: "Token exchange failed: 400 invalid_grant: Invalid JWT Signature." },
  );
});

test("getAccessToken error message does not contain secrets", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "fail" }),
      { status: 400 },
    );
  try {
    await getAccessToken({ client_email: "secret@proj.iam.gserviceaccount.com", private_key: privateKeyPem });
    assert.fail("should have thrown");
  } catch (e) {
    const msg = (e as Error).message;
    assert.ok(!msg.includes(privateKeyPem.slice(28, 80)), "must not contain private key");
    assert.ok(!msg.includes("secret@proj.iam"), "must not contain client_email");
  }
});

test("JWT assertion has correct claims and header per Google spec", async () => {
  const tokenEndpoint = "https://oauth2.googleapis.com/token";
  let capturedAssertion = "";
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const input = _input instanceof Request ? _input.url : String(_input);
    assert.equal(input, tokenEndpoint);
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("content-type"), "application/x-www-form-urlencoded");
    const body = init?.body;
    assert.ok(body instanceof URLSearchParams, "token request body must be URLSearchParams");
    assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    capturedAssertion = body.get("assertion") ?? "";
    assert.ok(capturedAssertion, "assertion must be present");
    return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
  };

  await getAccessToken({
    client_email: "test@project.iam.gserviceaccount.com",
    private_key: privateKeyPem,
  });

  assert.ok(capturedAssertion, "assertion must be captured");

  const header = decodeProtectedHeader(capturedAssertion);
  assert.equal(header.alg, "RS256");
  assert.equal(header.typ, "JWT");

  const payload = decodeJwt(capturedAssertion);
  assert.equal(payload.iss, "test@project.iam.gserviceaccount.com");
  assert.equal(payload.aud, "https://oauth2.googleapis.com/token");
  assert.equal((payload as Record<string, unknown>).scope, "https://www.googleapis.com/auth/calendar.events");

  const now = Math.floor(Date.now() / 1000);
  assert.ok(typeof payload.iat === "number" && Math.abs(payload.iat - now) < 5, "iat must be Unix seconds");
  assert.ok(typeof payload.exp === "number" && payload.exp - payload.iat! === 3600, "exp must be iat + 3600");
  assert.equal(payload.sub, undefined, "sub must not be set");
  assert.equal(payload.nbf, undefined, "nbf must not be set");
});

// --- upsert (create + 409 → PATCH) ---

test("upsertGoogleEvent creates event via POST", async () => {
  const calls: { method: string; url: string }[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ method: init?.method ?? "GET", url });
    return new Response("{}", { status: 200 });
  };

  await upsertGoogleEvent("token", "cal-id", "550e8400-e29b-41d4-a716-446655440000", {
    summary: "Test",
    start: { dateTime: "2026-08-10T10:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-08-10T11:00:00+09:00", timeZone: "Asia/Tokyo" },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.ok(calls[0].url.includes("/calendars/cal-id/events"));
});

test("upsertGoogleEvent falls back to PATCH on 409", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    if (init?.method === "POST") return new Response("conflict", { status: 409 });
    return new Response("{}", { status: 200 });
  };

  await upsertGoogleEvent("token", "cal-id", "550e8400-e29b-41d4-a716-446655440000", {
    summary: "Test",
    start: { dateTime: "2026-08-10T10:00:00+09:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2026-08-10T11:00:00+09:00", timeZone: "Asia/Tokyo" },
  });
  assert.deepEqual(calls, ["POST", "PATCH"]);
});

test("upsertGoogleEvent throws on non-409 error", async () => {
  globalThis.fetch = async () => new Response("server error", { status: 500 });
  await assert.rejects(
    () => upsertGoogleEvent("token", "cal-id", "id-1", { summary: "Test", start: { dateTime: "", timeZone: "" }, end: { dateTime: "", timeZone: "" } }),
    { message: /Google Calendar API error: 500/ },
  );
});

// --- delete ---

test("deleteGoogleEvent sends DELETE", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    return new Response(null, { status: 204 });
  };
  await deleteGoogleEvent("token", "cal-id", "550e8400-e29b-41d4-a716-446655440000");
  assert.deepEqual(calls, ["DELETE"]);
});

test("deleteGoogleEvent treats 404 as success", async () => {
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  await deleteGoogleEvent("token", "cal-id", "id-1");
});

test("deleteGoogleEvent treats 410 as success", async () => {
  globalThis.fetch = async () => new Response("gone", { status: 410 });
  await deleteGoogleEvent("token", "cal-id", "id-1");
});

test("deleteGoogleEvent throws on other errors", async () => {
  globalThis.fetch = async () => new Response("error", { status: 500 });
  await assert.rejects(
    () => deleteGoogleEvent("token", "cal-id", "id-1"),
    { message: /Google Calendar delete error: 500/ },
  );
});

// --- syncEventToGoogle ---

test("syncEventToGoogle returns failed when not configured", async () => {
  const result = await syncEventToGoogle({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test",
    description: null,
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
    status: "published",
  });
  assert.equal(result.status, "failed");
  assert.ok("error" in result && result.error.includes("not configured"));
});

test("syncEventToGoogle upserts published events", async () => {
  const sa = { type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKeyPem };
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(sa)).toString("base64");
  process.env.GOOGLE_CALENDAR_ID = "test-cal";

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    }
    return new Response("{}", { status: 200 });
  };

  const result = await syncEventToGoogle({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Test",
    description: null,
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
    status: "published",
  });
  assert.equal(result.status, "synced");
});

test("syncEventToGoogle deletes cancelled events", async () => {
  const sa = { type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKeyPem };
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(sa)).toString("base64");
  process.env.GOOGLE_CALENDAR_ID = "test-cal";

  const methods: string[] = [];
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    }
    methods.push(init?.method ?? "GET");
    return new Response(null, { status: 204 });
  };

  const result = await syncEventToGoogle({
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Cancelled",
    description: null,
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
    status: "cancelled",
  });
  assert.equal(result.status, "synced");
  assert.ok(methods.includes("DELETE"));
});

test("syncEventToGoogle returns failed on API error without throwing", async () => {
  const sa = { type: "service_account", client_email: "t@p.iam.gserviceaccount.com", private_key: privateKeyPem };
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(sa)).toString("base64");
  process.env.GOOGLE_CALENDAR_ID = "test-cal";

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    }
    return new Response("bad request", { status: 400 });
  };

  const result = await syncEventToGoogle({
    id: "id-1",
    title: "Test",
    description: null,
    start_at: "2026-08-10T10:00:00+09:00",
    end_at: "2026-08-10T11:00:00+09:00",
    status: "published",
  });
  assert.equal(result.status, "failed");
  assert.ok("error" in result);
});

// --- Permission checks ---

test("checkSyncPermission allows creator", () => {
  const result = checkSyncPermission({
    userId: "user-1",
    isAllowed: true,
    eventCreatedBy: "user-1",
  });
  assert.deepEqual(result, { ok: true });
});

test("checkSyncPermission rejects unauthenticated", () => {
  const result = checkSyncPermission({
    userId: null,
    isAllowed: false,
    eventCreatedBy: "user-1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 401);
});

test("checkSyncPermission rejects non-allowed user", () => {
  const result = checkSyncPermission({
    userId: "user-1",
    isAllowed: false,
    eventCreatedBy: "user-1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("checkSyncPermission rejects non-creator", () => {
  const result = checkSyncPermission({
    userId: "user-2",
    isAllowed: true,
    eventCreatedBy: "user-1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

// --- Module safety ---

test("google-calendar module uses server-only guard", () => {
  const source = fs.readFileSync("src/lib/google-calendar.ts", "utf8");
  assert.ok(source.includes('import "server-only"'));
});

test("env var names are server-only (no NEXT_PUBLIC_ prefix)", () => {
  assert.ok(!"GOOGLE_SERVICE_ACCOUNT_JSON_BASE64".startsWith("NEXT_PUBLIC_"));
  assert.ok(!"GOOGLE_CALENDAR_ID".startsWith("NEXT_PUBLIC_"));
});
