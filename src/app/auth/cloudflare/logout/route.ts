import { NextResponse } from "next/server";
import { cloudflareLogoutUrl } from "@/lib/cloudflare-access";

export function GET(request: Request) {
  const fallback = new URL("/login", request.url);
  if (process.env.AUTH_MODE !== "cloudflare") return NextResponse.redirect(fallback);
  try {
    return NextResponse.redirect(cloudflareLogoutUrl());
  } catch {
    return NextResponse.redirect(fallback);
  }
}
