import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloudflareAccessToken, verifyCloudflareAccessToken } from "@/lib/cloudflare-access";
import { generateSupabaseMagicLinkIfAllowed, safeNextPath } from "@/lib/cloudflare-auth-bridge";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), url.origin);

  try {
    if (process.env.AUTH_MODE !== "cloudflare") {
      return new NextResponse("Cloudflare Access authentication is not enabled", { status: 403 });
    }
    let email: string;
    try {
      ({ email } = await verifyCloudflareAccessToken(cloudflareAccessToken(request)));
    } catch {
      return new NextResponse("Cloudflare Access authentication required", { status: 403 });
    }
    const admin = createAdminClient();
    const magicLink = await generateSupabaseMagicLinkIfAllowed(admin, email);
    if (!magicLink) return new NextResponse("Cloudflare Access account is not allowed", { status: 403 });
    const { tokenHash } = magicLink;

    const response = NextResponse.redirect(new URL(next, url.origin));
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
        },
      },
    );
    const { data: verification, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (verifyError || !verification.session) throw new Error("Unable to establish Supabase session");
    return response;
  } catch {
    // Do not reveal whether configuration, assertion, or allowlist validation failed.
    return NextResponse.redirect(new URL("/login?error=access", url.origin));
  }
}
