import { NextResponse } from "next/server";
import { appOriginForRequest } from "@/lib/cloudflare-access";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null, origin: string) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }

  try {
    const target = new URL(value, origin);
    return target.origin === origin && target.pathname.startsWith("/")
      ? `${target.pathname}${target.search}${target.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOriginForRequest(request);
  const next = safeNextPath(url.searchParams.get("next"), origin);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login", origin));
}
