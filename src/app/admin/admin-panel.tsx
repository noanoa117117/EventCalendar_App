"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AllowedEmailRole, Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";

type Entry = Database["public"]["Tables"]["allowed_emails"]["Row"];
const roles: AllowedEmailRole[] = ["member", "admin", "super_user"];

export function AdminPanel({ initialEntries, role, preview = false }: { initialEntries: Entry[]; role: AllowedEmailRole; preview?: boolean }) {
  const router = useRouter();
  const client = createClient();
  const [entries, setEntries] = useState(initialEntries);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AllowedEmailRole>("member");
  const [busy, setBusy] = useState(false);
  const superUser = role === "super_user";
  const normalized = email.trim().toLowerCase();

  async function mutate(action: () => PromiseLike<{ error: { message?: string } | null }>, local: () => void, target?: string) {
    setBusy(true);
    try {
      if (preview) local();
      else {
        const { error } = await action();
        if (error) throw new Error(error.message ?? "操作に失敗しました。");
        const { data, error: refreshError } = await client.rpc("list_managed_allowed_emails");
        if (refreshError) {
          if (target && (await client.auth.getUser()).data.user?.email?.toLowerCase() === target) router.replace("/access-denied");
          throw new Error(refreshError.message);
        }
        setEntries(data ?? []);
        if (target && (await client.auth.getUser()).data.user?.email?.toLowerCase() === target) router.replace("/access-denied");
      }
    } catch (error) { window.alert(error instanceof Error ? error.message : "操作に失敗しました。"); }
    finally { setBusy(false); }
  }

  function add() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { window.alert("有効なメールアドレスを入力してください。"); return; }
    const addRole = superUser ? newRole : "member";
    mutate(
      () => client.rpc("manage_allowed_email", { p_email: normalized, p_role: addRole, p_enabled: true }),
      () => setEntries((old) => [...old.filter((entry) => entry.email !== normalized), { id: crypto.randomUUID(), email: normalized, is_enabled: true, role: addRole, created_at: new Date().toISOString() }].sort((a, b) => a.email.localeCompare(b.email))),
    );
    setEmail("");
  }

  return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-4 sm:p-6">
    <div><Link href="/" className="text-sm text-muted-foreground hover:underline">← イベントカレンダー</Link><h1 className="mt-3 text-2xl font-semibold">管理</h1><p className="text-sm text-muted-foreground">権限: {role}</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><label htmlFor="new-email" className="sr-only">メールアドレス</label><input id="new-email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="member@example.com" type="email" className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm" />{superUser && <><label htmlFor="new-role" className="sr-only">追加する権限</label><select id="new-role" value={newRole} disabled={busy} onChange={(event) => setNewRole(event.target.value as AllowedEmailRole)} className="rounded-md border bg-background px-3 py-2 text-sm">{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></>}<Button disabled={busy || !email.trim()} onClick={add}>{superUser ? "追加" : "メンバーを追加"}</Button></div>
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[640px] text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3 text-left">メールアドレス</th><th className="p-3 text-left">権限</th><th className="p-3 text-left">状態</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b last:border-0"><td className="p-3">{entry.email}</td><td className="p-3">{superUser ? <><label htmlFor={`role-${entry.id}`} className="sr-only">{entry.email} の権限</label><select id={`role-${entry.id}`} value={entry.role} disabled={busy} onChange={(event) => { const next = event.target.value as AllowedEmailRole; mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: next, p_enabled: entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, role: next } : item)), entry.is_enabled && next === "member" ? entry.email.toLowerCase() : undefined); }}>{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></> : entry.role}</td><td className="p-3">{entry.is_enabled ? "有効" : "無効"}</td><td className="space-x-2 p-3 text-right">{(superUser || entry.role === "member") && <><Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: entry.role, p_enabled: !entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, is_enabled: !item.is_enabled } : item)), entry.is_enabled ? entry.email.toLowerCase() : undefined)}>{entry.is_enabled ? "無効化" : "有効化"}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`${entry.email} を削除しますか？`)) mutate(() => client.rpc("delete_allowed_email", { p_email: entry.email }), () => setEntries((old) => old.filter((item) => item.id !== entry.id)), entry.email.toLowerCase()); }}>削除</Button></>}</td></tr>)}</tbody></table></div>
  </main>;
}
