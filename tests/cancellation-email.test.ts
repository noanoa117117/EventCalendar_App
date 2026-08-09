import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildCancellationEmail, sendCancellationEmail } from "../src/lib/cancellation-email.ts";

afterEach(() => {
  delete (process.env as Record<string, string | undefined>).RESEND_API_KEY;
  delete (process.env as Record<string, string | undefined>).RESEND_FROM;
});

test("buildCancellationEmail creates a safe Resend payload", () => {
  const payload = buildCancellationEmail("member@example.com", {
    title: "<予定>", startAt: "2026/08/10 10:00", endAt: "2026/08/10 11:00", organizerName: "主催者",
  }, "Calendar <calendar@example.com>");
  assert.deepEqual(payload.to, ["member@example.com"]);
  assert.equal(payload.from, "Calendar <calendar@example.com>");
  assert.match(payload.html, /&lt;予定&gt;/);
  assert.match(payload.subject, /予定/);
});

test("sendCancellationEmail reports missing configuration without fetch", async () => {
  let called = false;
  const result = await sendCancellationEmail("member@example.com", { title: "予定", startAt: "a", endAt: "b" }, { fetch: async () => { called = true; return new Response(); } });
  assert.deepEqual(result, { ok: false, reason: "not_configured" });
  assert.equal(called, false);
});

test("sendCancellationEmail posts to Resend and reports HTTP errors", async () => {
  let request: Request | undefined;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    return new Response("bad", { status: 422 });
  };
  const result = await sendCancellationEmail("member@example.com", { title: "予定", startAt: "a", endAt: "b" }, { apiKey: "re_test", from: "Calendar <calendar@example.com>", fetch });
  assert.deepEqual(result, { ok: false, reason: "resend_422" });
  assert.equal(request?.url, "https://api.resend.com/emails");
  assert.equal(request?.headers.get("authorization"), "Bearer re_test");
  assert.equal(request?.headers.get("user-agent"), "eventcalendar-app/1.0");
});
