import { NextResponse } from "next/server";
import { appOriginForRequest, cloudflareLogoutUrl } from "@/lib/cloudflare-access";

export function GET(request: Request) {
  const fallback = new URL("/login", appOriginForRequest(request));
  if (process.env.AUTH_MODE !== "cloudflare") return NextResponse.redirect(fallback);
  try {
    return NextResponse.redirect(cloudflareLogoutUrl());
  } catch {
    return NextResponse.redirect(fallback);
  }
}
