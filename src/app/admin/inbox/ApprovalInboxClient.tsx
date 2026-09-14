"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { InboxSection, InboxActionKind } from "@/lib/admin/approvalInbox";

type InboxResponse = { sections: InboxSection[]; total: number };

/** Map a one-tap action to the existing (壁3) approval endpoint. */
async function runAction(kind: InboxActionKind, id: string): Promise<Response> {
  if (kind === "issue_certificate") {
    return fetch("/api/admin/certificates/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: id, status: "active" }),
    });
  }
  // approve_purchase_order
  return fetch("/api/admin/purchase-orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status: "approved" }),
  });
}

export default function ApprovalInboxClient() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inbox", { cache: "no-store" });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      setData(json as InboxResponse);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (kind: InboxActionKind, id: string, label: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await runAction(kind, id);
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      setMsg(`${label}しました`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${label}に失敗しました`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-40 rounded-2xl bg-border-subtle" />;
  }

  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          承認待ち <span className="font-semibold text-primary">{total}</span> 件
        </span>
        <button onClick={() => void load()} className="text-xs text-accent hover:underline">
          更新
        </button>
      </div>

      {msg && <div className="rounded-xl bg-accent/10 px-4 py-2 text-sm text-primary">{msg}</div>}

      {total === 0 ? (
        <div className="rounded-2xl border border-border-subtle p-10 text-center text-muted">承認待ちはありません</div>
      ) : (
        (data?.sections ?? []).map((section) => (
          <section key={section.key} className="rounded-2xl border border-border-subtle">
            <div className="border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-primary">{section.label}</h2>
                <span className="rounded-full bg-border-subtle px-2 py-0.5 text-xs text-muted">{section.count}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{section.hint}</p>
            </div>
            <ul className="divide-y divide-border-subtle">
              {section.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-primary">{item.title}</div>
                    <div className="truncate text-xs text-muted">{item.subtitle}</div>
                    {item.why && <div className="truncate text-[11px] text-muted/80">{item.why}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={item.href} className="text-xs text-accent hover:underline">
                      確認
                    </Link>
                    {item.action && (
                      <button
                        onClick={() => approve(item.action!.kind, item.id, item.action!.label)}
                        disabled={busy === item.id}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busy === item.id ? "処理中…" : item.action.label}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
