"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { formatJpy } from "@/lib/format";
import { AGENT_COMMISSION_STATUS_MAP } from "@/lib/statusMaps";

/* ── Types ── */
type Commission = {
  id: string;
  agent_id: string;
  referral_id: string | null;
  period_start: string | null;
  period_end: string | null;
  base_amount: number | null;
  commission_rate: number | null;
  commission_type: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  stripe_transfer_id: string | null;
  paid_at: string | null;
  created_at: string;
  agents: { name: string | null; stripe_account_id: string | null; stripe_onboarding_done: boolean | null } | null;
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "すべて" },
  { key: "pending", label: "未払い" },
  { key: "approved", label: "承認済み" },
  { key: "paid", label: "支払い済み" },
];

function statusEntry(s: string) {
  return AGENT_COMMISSION_STATUS_MAP[s] ?? { label: s, variant: "default" as const };
}

export default function AdminCommissionsClient() {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/agent-commissions${qs}`, { cache: "no-store" });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      setRows((json?.commissions ?? []) as Commission[]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "pay" | "cancel") => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-commissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      setMsg(json?.message ?? "更新しました");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        tag="COMMISSIONS"
        title="代理店コミッション"
        description="紹介経由の有料化で自動計上されたコミッションの承認・送金（Stripe Connect）"
        tabs={FILTERS.map((f) => ({ key: f.key || "all", label: f.label }))}
        activeTab={filter || "all"}
        onTabSelect={(k) => setFilter(k === "all" ? "" : k)}
      />

      {msg && <div className="rounded-xl bg-accent/10 px-4 py-2 text-sm text-primary">{msg}</div>}

      {loading ? (
        <div className="animate-pulse h-40 rounded-2xl bg-border-subtle" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle p-8 text-center text-muted">
          コミッションはまだありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full text-sm">
            <thead className="bg-border-subtle/40 text-left text-muted">
              <tr>
                <th className="px-4 py-3">代理店</th>
                <th className="px-4 py-3">対象期間</th>
                <th className="px-4 py-3 text-right">決済額(基準)</th>
                <th className="px-4 py-3 text-right">料率</th>
                <th className="px-4 py-3 text-right">コミッション</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const se = statusEntry(c.status);
                const onboarded = !!c.agents?.stripe_onboarding_done && !!c.agents?.stripe_account_id;
                const dispatched = !!c.stripe_transfer_id;
                return (
                  <tr key={c.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 font-medium text-primary">{c.agents?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.period_start ?? "—"} 〜 {c.period_end ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{formatJpy(c.base_amount ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {c.commission_type === "fixed" ? "固定" : `${c.commission_rate ?? 0}%`}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatJpy(c.amount ?? 0)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={se.variant}>{se.label}</Badge>
                      {c.status === "approved" && dispatched && <span className="ml-2 text-xs text-muted">送金中</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {c.status === "pending" && (
                          <button
                            onClick={() => act(c.id, "approve")}
                            disabled={busy === c.id}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            承認
                          </button>
                        )}
                        {c.status === "approved" && !dispatched && (
                          <button
                            onClick={() => act(c.id, "pay")}
                            disabled={busy === c.id || !onboarded}
                            title={onboarded ? "Stripe で送金" : "代理店のStripe送金設定が未完了です"}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            送金
                          </button>
                        )}
                        {(c.status === "pending" || c.status === "approved") && !dispatched && (
                          <button
                            onClick={() => act(c.id, "cancel")}
                            disabled={busy === c.id}
                            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-muted hover:text-primary disabled:opacity-50"
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
