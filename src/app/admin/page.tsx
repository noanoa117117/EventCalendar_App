import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDevPreviewEnabled } from "@/lib/dev-auth";
import type { AllowedEmailRole, Database } from "@/lib/database.types";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  if (isDevPreviewEnabled()) {
    const entry: Database["public"]["Tables"]["allowed_emails"]["Row"] = { id: "00000000-0000-4000-8000-000000000099", email: "sinigamiyuuna@gmail.com", is_enabled: true, role: "super_user", created_at: new Date().toISOString() };
    return <AdminPanel initialEntries={[entry]} role="super_user" preview />;
  }
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_user_role");
  if (!role || (role !== "admin" && role !== "super_user")) redirect("/access-denied");
  const { data: entries, error } = await supabase.rpc("list_managed_allowed_emails");
  if (error) redirect("/access-denied");
  return <AdminPanel initialEntries={entries ?? []} role={role as AllowedEmailRole} />;
}
