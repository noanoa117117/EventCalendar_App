import "server-only";

export function safeNextPath(value: string | null, origin: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const target = new URL(value, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : "/";
  } catch {
    return "/";
  }
}

type LinkAdminClient = {
  auth: {
    admin: {
      generateLink: (options: { type: "magiclink"; email: string }) => Promise<{
        data: { properties?: { hashed_token?: string } | null; user?: { id: string } | null } | null;
        error: unknown;
      }>;
    };
  };
};

type AdminClient = LinkAdminClient & {
  from: (table: "allowed_emails") => {
    select: (columns: "email") => {
      eq: (column: "email" | "is_enabled", value: string | boolean) => {
        eq: (column: "email" | "is_enabled", value: string | boolean) => {
          maybeSingle: () => PromiseLike<{ data: { email: string } | null; error: unknown }>;
        };
      };
    };
  };
};

/**
 * Enforce the allowlist before asking Supabase to create a one-time link.
 * Returning null for both a query error and a denied row keeps the caller from
 * accidentally continuing into session establishment.
 */
export async function generateSupabaseMagicLinkIfAllowed(admin: unknown, email: string) {
  const client = admin as AdminClient;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) return null;
  const { data: allowed, error } = await client
    .from("allowed_emails")
    .select("email")
    .eq("email", normalizedEmail)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error || !allowed) return null;
  return generateSupabaseMagicLink(client, normalizedEmail);
}

export async function generateSupabaseMagicLink(admin: LinkAdminClient, email: string) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  const userId = link?.user?.id;
  if (error || !tokenHash || !userId) throw new Error("Unable to create Supabase session link");
  return { userId, tokenHash };
}
