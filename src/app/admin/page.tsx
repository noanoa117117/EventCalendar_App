import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDevPreviewEnabled } from "@/lib/dev-auth";
import type { AllowedEmailRole, ManagedAllowedEmail } from "@/lib/database.types";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  if (isDevPreviewEnabled()) {
    const entry: ManagedAllowedEmail = { id: "00000000-0000-4000-8000-000000000099", email: "sinigamiyuuna@gmail.com", nickname: "ローカル管理者", is_enabled: true, role: "super_user", created_at: new Date().toISOString() };
    return <AdminPanel initialEntries={[entry]} role="super_user" actorEmail={entry.email} preview />;
  }
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_user_role");
  if (!role || (role !== "admin" && role !== "super_user")) redirect("/access-denied");
  const { data: user } = await supabase.auth.getUser();
  const actorEmail = user.user?.email?.trim().toLowerCase() ?? "";
  const { data: entries, error } = await supabase.rpc("list_managed_allowed_emails");
  if (error) redirect("/access-denied");
  return <AdminPanel initialEntries={entries ?? []} role={role as AllowedEmailRole} actorEmail={actorEmail} />;
}
