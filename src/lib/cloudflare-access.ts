import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isLoopbackSupabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export function isLocalAuthAllowed() {
  return process.env.NODE_ENV === "development" && isLoopbackSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function teamDomain() {
  const value = required("CF_ACCESS_TEAM_DOMAIN");
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("CF_ACCESS_TEAM_DOMAIN must be an HTTPS origin");
  }
  return url.origin;
}

export async function verifyCloudflareAccessToken(token: string) {
  const issuer = teamDomain();
  const audience = required("CF_ACCESS_AUD");
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer));
    jwksByIssuer.set(issuer, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "nbf"],
  });
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) throw new Error("Cloudflare Access token has no email");
  return { email };
}

export function cloudflareLogoutUrl() {
  return new URL("/cdn-cgi/access/logout", teamDomain());
}

export function cloudflareAccessToken(request: Request) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token) throw new Error("Cloudflare Access assertion is missing");
  return token;
}
