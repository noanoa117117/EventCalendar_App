import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { isDevPreviewEnabled } from "@/lib/dev-auth";
import { cloudflareAccessToken, isLocalAuthAllowed, verifyCloudflareAccessToken } from "@/lib/cloudflare-access";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/cloudflare", "/access-denied"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);
  if (pathname === "/dev-preview" || (isDevPreviewEnabled() && pathname === "/admin")) {
    return NextResponse.next({ request });
  }
  if (isDevPreviewEnabled() && (pathname === "/" || pathname === "/events" || pathname === "/availability" || pathname === "/planning")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dev-preview";
    if (pathname === "/availability") url.searchParams.set("preview", "availability");
    if (pathname === "/planning") url.searchParams.set("preview", "planning");
    if (pathname === "/events") url.searchParams.set("preview", "events");
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

  // In the hosted deployment Cloudflare Access is the authentication
  // boundary. Reject protected requests before touching application data when
  // the assertion is absent or invalid.
  // Local fixture development is the sole opt-out. Any other/missing mode
  // fails closed rather than allowing an old Supabase session to bypass
  // Cloudflare Access while production configuration is incomplete.
  const authMode = process.env.AUTH_MODE;
  const localMode = authMode === "local";
  const cloudflareMode = authMode === "cloudflare";
  if (localMode && !isLocalAuthAllowed()) {
    return new NextResponse("Invalid local authentication configuration", { status: 500 });
  }
  if (!localMode && !cloudflareMode) {
    return new NextResponse("Authentication configuration required", { status: 500 });
  }
  let cloudflareEmail: string | null = null;
  if (cloudflareMode && !publicPath) {
    try {
      cloudflareEmail = (await verifyCloudflareAccessToken(cloudflareAccessToken(request))).email;
    } catch {
      return new NextResponse("Cloudflare Access authentication required", { status: 403 });
    }
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (publicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (cloudflareMode && !publicPath) {
    if (!user.email || user.email.trim().toLowerCase() !== cloudflareEmail) {
      return new NextResponse("Cloudflare Access identity mismatch", { status: 403 });
    }
  }

  // Whitelist gate: this RPC evaluates the current JWT in the database
  // without exposing allowlist email addresses through the client API.
  const { data: isAllowed } = await supabase.rpc("is_allowed_user");

  if (!isAllowed) {
    if (isPublicPath(pathname) && pathname !== "/access-denied") return response;
    const url = request.nextUrl.clone();
    url.pathname = "/access-denied";
    return NextResponse.redirect(url);
  }

  if (pathname === "/admin") {
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) {
      const url = request.nextUrl.clone();
      url.pathname = "/access-denied";
      return NextResponse.redirect(url);
    }
  }

  if (pathname === "/login" || pathname === "/access-denied" || pathname.startsWith("/access-denied/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.nickname && pathname !== "/setup-nickname") {
    const url = request.nextUrl.clone();
    url.pathname = "/setup-nickname";
    return NextResponse.redirect(url);
  }

  if (profile?.nickname && pathname === "/setup-nickname") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
