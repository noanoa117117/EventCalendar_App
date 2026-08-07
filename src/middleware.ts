import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// OpenNext for Cloudflare supports Edge middleware but not Next 16's Node-only
// proxy.ts. Keep the complete authentication gate here until Node Proxy is
// officially supported by the adapter and the Worker acceptance suite passes.
export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
