import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/access-denied"];

export async function updateSession(request: NextRequest) {
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

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isPublicPath) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Whitelist gate: a Supabase session can exist for any Google account,
  // but only allowed_emails rows grant access to app data (RLS only lets a
  // user read their own row here, see migrations).
  const { data: allowed } = await supabase
    .from("allowed_emails")
    .select("is_enabled")
    .eq("email", (user.email ?? "").trim().toLowerCase())
    .maybeSingle();

  if (!allowed?.is_enabled) {
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
