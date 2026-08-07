import assert from "node:assert/strict";
import { before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  appOriginForRequest,
  cloudflareAppOrigin,
  isExpectedCloudflareAppRequest,
  isLocalAuthAllowed,
  isLoopbackSupabaseUrl,
  verifyCloudflareAccessToken,
} from "../src/lib/cloudflare-access.ts";
import { generateSupabaseMagicLink, generateSupabaseMagicLinkIfAllowed, safeNextPath } from "../src/lib/cloudflare-auth-bridge.ts";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const issuer = "https://team.example.cloudflareaccess.com";
globalThis.fetch = async () => new Response(JSON.stringify({
  keys: [{ ...jwk, kid: "current", alg: "RS256", use: "sig" }],
}), { headers: { "content-type": "application/json" } });

before(() => {
  process.env.CF_ACCESS_TEAM_DOMAIN = issuer;
  process.env.CF_ACCESS_AUD = "audience";
  process.env.APP_ORIGIN = "https://invitation-event-calendar.amida-solutions.uk";
});

async function token(overrides: Record<string, unknown> = {}, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "User@Example.com", ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "current" })
    .setIssuer(issuer)
    .setAudience("audience")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setNotBefore(now - 1)
    .sign(key);
}

test("accepts a valid token and normalizes email", async () => {
  assert.deepEqual(await verifyCloudflareAccessToken(await token()), { email: "user@example.com" });
});

test("rejects missing JWT and forged signatures", async () => {
  await assert.rejects(() => verifyCloudflareAccessToken(""));
  const forged = await token({}, (await generateKeyPair("RS256")).privateKey);
  await assert.rejects(() => verifyCloudflareAccessToken(forged));
  const ec = await generateKeyPair("ES256");
  const now = Math.floor(Date.now() / 1000);
  const wrongAlgorithm = await new SignJWT({ email: "user@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "current" }).setIssuer(issuer).setAudience("audience")
    .setIssuedAt(now).setExpirationTime(now + 300).setNotBefore(now - 1).sign(ec.privateKey);
  await assert.rejects(() => verifyCloudflareAccessToken(wrongAlgorithm));
});

test("rejects issuer and audience mismatches", async () => {
  const badIssuer = await new SignJWT({ email: "user@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "current" }).setIssuer("https://wrong.example")
    .setAudience("audience").setIssuedAt().setExpirationTime("5m").setNotBefore("0s").sign(privateKey);
  await assert.rejects(() => verifyCloudflareAccessToken(badIssuer));
  process.env.CF_ACCESS_AUD = "different-audience";
  const wrongAudience = await token();
  await assert.rejects(() => verifyCloudflareAccessToken(wrongAudience));
  process.env.CF_ACCESS_AUD = "audience";
});

test("requires valid expiration and not-before claims", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [
    { exp: now - 1, nbf: now - 2 },
    { exp: now + 300, nbf: now + 60 },
    { nbf: now - 1 },
    { exp: now + 300 },
  ]) {
    const value = await new SignJWT({ email: "user@example.com", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "current" }).setIssuer(issuer).setAudience("audience").sign(privateKey);
    await assert.rejects(() => verifyCloudflareAccessToken(value));
  }
});

test("allows local auth only in development with loopback Supabase", () => {
  process.env.AUTH_MODE = "local";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  assert.equal(isLocalAuthAllowed(), false);
  (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  assert.equal(isLocalAuthAllowed(), true);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://remote.supabase.co";
  assert.equal(isLocalAuthAllowed(), false);
  assert.equal(isLoopbackSupabaseUrl("http://localhost:54321"), true);
  assert.equal(isLoopbackSupabaseUrl("https://supabase.test"), false);
});

test("accepts only the configured Cloudflare application origin", () => {
  process.env.AUTH_MODE = "cloudflare";
  process.env.APP_ORIGIN = "https://invitation-event-calendar.amida-solutions.uk";
  assert.equal(cloudflareAppOrigin(), "https://invitation-event-calendar.amida-solutions.uk");
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://invitation-event-calendar.amida-solutions.uk/events")), true);
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://INVITATION-EVENT-CALENDAR.AMIDA-SOLUTIONS.UK/events")), true);
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://invitation-event-calendar.amida-solutions.uk/events", {
    headers: { host: "attacker.example", "x-forwarded-host": "attacker.example" },
  })), true);
  assert.equal(isExpectedCloudflareAppRequest(new Request("http://invitation-event-calendar.amida-solutions.uk/events")), false);
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://invitation-event-calendar.amida-solutions.uk.evil.example/events")), false);
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://attacker.example/events", {
    headers: { host: "invitation-event-calendar.amida-solutions.uk" },
  })), false);
  assert.equal(isExpectedCloudflareAppRequest(new Request("https://calendar-amida-solutions-uk.workers.dev/events")), false);
  assert.equal(appOriginForRequest(new Request("https://attacker.example/events")), "https://invitation-event-calendar.amida-solutions.uk");
});

test("rejects malformed or missing Cloudflare application origins", () => {
  for (const origin of ["", "http://invitation-event-calendar.amida-solutions.uk", "https://invitation-event-calendar.amida-solutions.uk:8443", "https://invitation-event-calendar.amida-solutions.uk/path"]) {
    process.env.APP_ORIGIN = origin;
    assert.throws(() => cloudflareAppOrigin());
  }
  process.env.APP_ORIGIN = "https://invitation-event-calendar.amida-solutions.uk";
});

test("rejects production local mode", () => {
  process.env.AUTH_MODE = "local";
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  assert.equal(isLocalAuthAllowed(), false);
});

test("keeps safe next redirects same-origin", () => {
  const origin = "https://calendar.example";
  assert.equal(safeNextPath("/events?month=1#today", origin), "/events?month=1#today");
  for (const value of ["https://evil.example/", "//evil.example/", "/\\evil", "javascript:alert(1)"]) {
    assert.equal(safeNextPath(value, origin), "/");
  }
});

test("reuses an existing auth user without createUser", async () => {
  const existingId = "user-123";
  let generateCalls = 0;
  let createCalls = 0;
  const admin = {
    auth: { admin: {
      generateLink: async () => { generateCalls += 1; return { data: { user: { id: existingId }, properties: { hashed_token: "hash" } }, error: null }; },
      createUser: async () => { createCalls += 1; throw new Error("duplicate creation"); },
    } },
  };
  const first = await generateSupabaseMagicLink(admin, "user@example.com");
  const second = await generateSupabaseMagicLink(admin, "user@example.com");
  assert.equal(first.userId, existingId);
  assert.equal(second.userId, existingId);
  assert.equal(generateCalls, 2);
  assert.equal(createCalls, 0);
});

test("checks the normalized enabled allowlist before generating a link", async () => {
  const calls: string[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string | boolean) => {
          calls.push(`eq:${String(value)}`);
          return {
            eq: (_nextColumn: string, nextValue: string | boolean) => {
              calls.push(`eq:${String(nextValue)}`);
              return { maybeSingle: async () => ({ data: { email: "user@example.com" }, error: null }) };
            },
          };
        },
      }),
    }),
    auth: { admin: {
      generateLink: async () => {
        calls.push("generateLink");
        return { data: { user: { id: "user-123" }, properties: { hashed_token: "hash" } }, error: null };
      },
    } },
  };
  const result = await generateSupabaseMagicLinkIfAllowed(admin, " User@Example.com ");
  assert.equal(result?.tokenHash, "hash");
  assert.deepEqual(calls, ["eq:user@example.com", "eq:true", "generateLink"]);
});

test("does not generate a link for a denied or disabled allowlist row", async () => {
  for (const result of [
    { data: null, error: null },
    { data: null, error: new Error("query failed") },
  ]) {
    let generateCalls = 0;
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
        }),
      }),
      auth: { admin: { generateLink: async () => {
        generateCalls += 1;
        return { data: null, error: null };
      } } },
    };
    assert.equal(await generateSupabaseMagicLinkIfAllowed(admin, "user@example.com"), null);
    assert.equal(generateCalls, 0);
  }
});

test("supports JWKS kid rotation", async () => {
  const rotated = await generateKeyPair("RS256");
  const rotatedJwk = await exportJWK(rotated.publicKey);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...rotatedJwk, kid: "rotated", alg: "RS256", use: "sig" }] }));
  const rotatedIssuer = "https://rotated-team.example.cloudflareaccess.com";
  process.env.CF_ACCESS_TEAM_DOMAIN = rotatedIssuer;
  const now = Math.floor(Date.now() / 1000);
  const rotatedToken = await new SignJWT({ email: "User@Example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "rotated" }).setIssuer(rotatedIssuer).setAudience("audience")
    .setIssuedAt(now).setExpirationTime(now + 300).setNotBefore(now - 1).sign(rotated.privateKey);
  assert.deepEqual(await verifyCloudflareAccessToken(rotatedToken), { email: "user@example.com" });
  globalThis.fetch = oldFetch;
});
