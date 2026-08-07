import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { isDevPreviewEnabled } from "@/lib/dev-auth";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/access-denied"];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/dev-preview") {
    return NextResponse.next({ request });
  }
  if (isDevPreviewEnabled() && (pathname === "/" || pathname === "/events" || pathname === "/availability" || pathname === "/planning")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dev-preview";
    if (pathname === "/availability") url.searchParams.set("preview", "availability");
    if (pathname === "/planning") url.searchParams.set("preview", "planning");
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

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

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isPublicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Whitelist gate: this RPC evaluates the current JWT in the database
  // without exposing allowlist email addresses through the client API.
  const { data: isAllowed } = await supabase.rpc("is_allowed_user");

  if (!isAllowed) {
    if (pathname.startsWith("/access-denied")) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/access-denied";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" || pathname.startsWith("/access-denied")) {
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
