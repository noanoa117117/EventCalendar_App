import { redirect } from "next/navigation";
import { format, isValid, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getDevPlanningData, isDevPreviewEnabled } from "@/lib/dev-auth";
import type { ActiveProfile } from "@/lib/database.types";
import { PlanningBoard } from "./_components/planning-board";

export interface PlanningQuery {
  date?: string;
  start?: string;
  memberIds?: string[];
}

export function parsePlanningQuery(params: Record<string, string | string[] | undefined>, allowedIds?: Set<string>): PlanningQuery {
  const parsedDate = typeof params.date === "string" ? parseISO(params.date) : null;
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && parsedDate && isValid(parsedDate) && format(parsedDate, "yyyy-MM-dd") === params.date ? params.date : undefined;
  const start = typeof params.start === "string" && /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(params.start) ? params.start : undefined;
  const raw = typeof params.members === "string" ? params.members.split(",") : [];
  const memberIds = raw.filter((id) => id.length > 0 && (!allowedIds || allowedIds.has(id)));
  return { date, start, memberIds: memberIds.length ? Array.from(new Set(memberIds)) : undefined };
}

export default async function PlanningPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parsePlanningQuery(await searchParams ?? {});
  if (isDevPreviewEnabled()) {
    const data = getDevPlanningData();
    return <PlanningBoard {...data} preview initialDate={query.date} initialStart={query.start} initialMemberIds={query.memberIds} />;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: currentUser }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("id, nickname, color").eq("id", user.id).single(),
    supabase.rpc("list_active_profiles"),
  ]);
  if (!currentUser) redirect("/setup-nickname");
  const activeMembers = (members ?? []) as ActiveProfile[];
  const safeQuery = parsePlanningQuery(await searchParams ?? {}, new Set(activeMembers.map((member) => member.id)));
  return <PlanningBoard currentUser={currentUser} members={activeMembers} initialDate={safeQuery.date} initialStart={safeQuery.start} initialMemberIds={safeQuery.memberIds} />;
}
