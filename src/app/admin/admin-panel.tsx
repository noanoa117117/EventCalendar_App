"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AllowedEmailRole, ManagedAllowedEmail } from "@/lib/database.types";
import { Button } from "@/components/ui/button";

type Entry = ManagedAllowedEmail;
const roles: AllowedEmailRole[] = ["member", "admin", "super_user"];

export function AdminPanel({ initialEntries, role, actorEmail, preview = false }: { initialEntries: Entry[]; role: AllowedEmailRole; actorEmail: string; preview?: boolean }) {
  const client = createClient();
  const [entries, setEntries] = useState(initialEntries);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AllowedEmailRole>("member");
  const [busy, setBusy] = useState(false);
  const superUser = role === "super_user";
  const normalized = email.trim().toLowerCase();

  async function mutate(action: () => PromiseLike<{ error: { message?: string } | null }>, local: () => void) {
    setBusy(true);
    try {
      if (!preview) {
        const { error } = await action();
        if (error) throw new Error(error.message ?? "操作に失敗しました。");
      }
      local();
      if (!preview) {
        const { data, error: refreshError } = await client.rpc("list_managed_allowed_emails");
        if (refreshError) {
          window.alert("操作は成功しましたが、一覧の再取得に失敗しました。表示中の内容を維持しています。");
          return;
        }
        setEntries(data ?? []);
      }
    } catch (error) { window.alert(error instanceof Error ? error.message : "操作に失敗しました。"); }
    finally { setBusy(false); }
  }

  function add() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { window.alert("有効なメールアドレスを入力してください。"); return; }
    if (normalized === actorEmail) { window.alert("自分の許可メールは変更できません。"); return; }
    const addRole = superUser ? newRole : "member";
    mutate(
      () => client.rpc("manage_allowed_email", { p_email: normalized, p_role: addRole, p_enabled: true }),
      () => setEntries((old) => [...old.filter((entry) => entry.email !== normalized), { id: crypto.randomUUID(), email: normalized, nickname: null, is_enabled: true, role: addRole, created_at: new Date().toISOString() }].sort((a, b) => a.email.localeCompare(b.email))),
    );
    setEmail("");
  }

  return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-4 sm:p-6">
    <div><Link href="/" className="text-sm text-muted-foreground hover:underline">← イベントカレンダー</Link><h1 className="mt-3 text-2xl font-semibold">管理</h1><p className="text-sm text-muted-foreground">権限: {role}</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><label htmlFor="new-email" className="sr-only">メールアドレス</label><input id="new-email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="member@example.com" type="email" className="h-11 min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm sm:h-8" />{superUser && <><label htmlFor="new-role" className="sr-only">追加する権限</label><select id="new-role" value={newRole} disabled={busy} onChange={(event) => setNewRole(event.target.value as AllowedEmailRole)} className="h-11 w-full rounded-md border bg-card px-3 py-2 text-sm sm:h-8 sm:w-auto">{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></>}<Button className="h-11 w-full sm:h-8 sm:w-auto" disabled={busy || !email.trim()} onClick={add}>{superUser ? "追加" : "メンバーを追加"}</Button></div>
    <div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full min-w-[700px] text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3 text-left">メールアドレス</th><th className="p-3 text-left">ニックネーム</th><th className="p-3 text-left">権限</th><th className="p-3 text-left">状態</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{entries.map((entry) => { const self = entry.email.trim().toLowerCase() === actorEmail; return <tr key={entry.id} className="border-b last:border-0"><td className="break-words p-3">{entry.email}</td><td className="break-words p-3">{entry.nickname ?? "未設定"}</td><td className="p-3">{superUser && !self ? <><label htmlFor={`role-${entry.id}`} className="sr-only">{entry.email} の権限</label><select id={`role-${entry.id}`} value={entry.role} disabled={busy} onChange={(event) => { const next = event.target.value as AllowedEmailRole; mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: next, p_enabled: entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, role: next } : item))); }}>{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></> : entry.role}</td><td className="p-3">{entry.is_enabled ? "有効" : "無効"}</td><td className="space-x-2 p-3 text-right">{!self && (superUser || entry.role === "member") && <><Button size="sm" variant="outline" disabled={busy} onClick={() => mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: entry.role, p_enabled: !entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, is_enabled: !item.is_enabled } : item)))}>{entry.is_enabled ? "無効化" : "有効化"}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`${entry.email} を削除しますか？`)) mutate(() => client.rpc("delete_allowed_email", { p_email: entry.email }), () => setEntries((old) => old.filter((item) => item.id !== entry.id))); }}>削除</Button></>}</td></tr>; })}</tbody></table></div>
    <ul className="divide-y rounded-lg border md:hidden" aria-label="許可されたメールアドレス">{entries.map((entry) => { const self = entry.email.trim().toLowerCase() === actorEmail; return <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm">{entry.email}</p>
        <p className="break-words text-xs text-muted-foreground">ニックネーム: {entry.nickname ?? "未設定"}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {superUser && !self ? <><label htmlFor={`mobile-role-${entry.id}`} className="sr-only">{entry.email} の権限</label><select id={`mobile-role-${entry.id}`} value={entry.role} disabled={busy} onChange={(event) => { const next = event.target.value as AllowedEmailRole; mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: next, p_enabled: entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, role: next } : item))); }} className="rounded border bg-card px-1.5 py-0.5">{roles.map((value) => <option key={value} value={value}>{value}</option>)}</select></> : <span>{entry.role}</span>}
          <span className={entry.is_enabled ? "text-success" : "text-muted-foreground"}>
            <span className={`mr-0.5 inline-block size-1.5 rounded-full ${entry.is_enabled ? "bg-success" : "bg-muted-foreground/40"}`} />{entry.is_enabled ? "有効" : "無効"}
          </span>
        </div>
      </div>
      {!self && (superUser || entry.role === "member") && <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => mutate(() => client.rpc("manage_allowed_email", { p_email: entry.email, p_role: entry.role, p_enabled: !entry.is_enabled }), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, is_enabled: !item.is_enabled } : item)))}>{entry.is_enabled ? "無効化" : "有効化"}</Button>
        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" disabled={busy} onClick={() => { if (window.confirm(`${entry.email} を削除しますか？`)) mutate(() => client.rpc("delete_allowed_email", { p_email: entry.email }), () => setEntries((old) => old.filter((item) => item.id !== entry.id))); }}>削除</Button>
      </div>}
    </li>; })}</ul>
  </main>;
}
