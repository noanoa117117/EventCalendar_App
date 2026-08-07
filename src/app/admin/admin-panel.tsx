"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AllowedEmailRole, Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";

type Entry = Database["public"]["Tables"]["allowed_emails"]["Row"];

export function AdminPanel({ initialEntries, role, preview = false }: { initialEntries: Entry[]; role: AllowedEmailRole; preview?: boolean }) {
  const [entries, setEntries] = useState(initialEntries);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const superUser = role === "super_user";
  const call = async (action: () => Promise<unknown>, update: () => void) => {
    setBusy(true);
    try { if (!preview) { const result = await action(); if ((result as { error?: { message?: string } })?.error) throw new Error((result as { error: { message?: string } }).error.message); } update(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "操作に失敗しました。"); }
    finally { setBusy(false); }
  };
  const normalized = email.trim().toLowerCase();
  function add() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return window.alert("有効なメールアドレスを入力してください。");
    const existing = entries.find((entry) => entry.email === normalized);
    call(() => Promise.resolve(createClient().rpc("set_member_access", { p_email: normalized, p_enabled: true })), () => setEntries((old) => existing ? old.map((entry) => entry.email === normalized ? { ...entry, is_enabled: true } : entry) : [...old, { id: crypto.randomUUID(), email: normalized, is_enabled: true, role: "member" as const, created_at: new Date().toISOString() }].sort((a, b) => a.email.localeCompare(b.email))));
    setEmail("");
  }
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 p-6"><div><Link href="/" className="text-sm text-muted-foreground hover:underline">← ダッシュボード</Link><h1 className="mt-3 text-2xl font-semibold">管理</h1><p className="text-sm text-muted-foreground">権限: {role}</p></div><div className="flex gap-2"><input value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="member@example.com" type="email" className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm" /><Button disabled={busy || !email.trim()} onClick={add}>メンバーを追加</Button></div><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3 text-left">メールアドレス</th><th className="p-3 text-left">権限</th><th className="p-3 text-left">状態</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b last:border-0"><td className="p-3">{entry.email}</td><td className="p-3">{superUser ? <select value={entry.role} disabled={busy} onChange={(event) => { const next = event.target.value as AllowedEmailRole; call(() => Promise.resolve(createClient().rpc("set_allowed_email_role", { p_email: entry.email, p_role: next })), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, role: next } : item))); }}>{(["member", "admin", "super_user"] as AllowedEmailRole[]).map((value) => <option key={value} value={value}>{value}</option>)}</select> : entry.role}</td><td className="p-3">{entry.is_enabled ? "有効" : "無効"}</td><td className="space-x-2 p-3 text-right">{entry.role === "member" && <><Button size="sm" variant="outline" disabled={busy} onClick={() => call(() => Promise.resolve(createClient().rpc("set_member_access", { p_email: entry.email, p_enabled: !entry.is_enabled })), () => setEntries((old) => old.map((item) => item.id === entry.id ? { ...item, is_enabled: !item.is_enabled } : item)))}>{entry.is_enabled ? "無効化" : "有効化"}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`${entry.email} を削除しますか？`)) call(() => Promise.resolve(createClient().rpc("delete_member", { p_email: entry.email })), () => setEntries((old) => old.filter((item) => item.id !== entry.id))); }}>削除</Button></>}</td></tr>)}</tbody></table></div></main>;
}
