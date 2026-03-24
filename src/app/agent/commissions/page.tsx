"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDateTime, formatJpy } from "@/lib/format";
import { AGENT_COMMISSION_STATUS_MAP, getStatusEntry } from "@/lib/statusMaps";

interface Commission {
  id: string;
  period: string;
  referral_shop_name: string;
  base_amount: number;
  rate: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
}

interface CommissionSummary {
  total_earned: number;
  pending: number;
  this_month: number;
}

export default function AgentCommissionsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary>({
    total_earned: 0,
    pending: 0,
    this_month: 0,
  });

  // Filter state
  const now = new Date();
  const [periodFrom, setPeriodFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [periodTo, setPeriodTo] = useState(periodFrom);

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = "/agent/login";
    });
  }, [supabase]);

  // Fetch commissions
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (periodFrom) params.set("from", periodFrom);
        if (periodTo) params.set("to", periodTo);
        const res = await fetch(`/api/agent/commissions?${params.toString()}`);
        if (!res.ok) throw new Error("データの取得に失敗しました");
        const json = await res.json();
        if (!cancelled) {
          setCommissions(json.commissions ?? []);
          setSummary(
            json.summary ?? { total_earned: 0, pending: 0, this_month: 0 },
          );
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "エラーが発生しました",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [periodFrom, periodTo]);

  /* ── Skeleton ── */
  const Skeleton = () => (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-5 animate-pulse">
            <div className="h-3 w-20 rounded bg-surface-hover mb-2" />
            <div className="h-6 w-28 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="glass-card p-5 animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded bg-surface-hover" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-1">
          <span className="section-tag">COMMISSIONS</span>
          <h1 className="text-[28px] font-semibold tracking-tight text-primary leading-tight">
            コミッション履歴
          </h1>
          <p className="text-[14px] text-secondary leading-relaxed">
            紹介手数料の履歴・集計を確認できます。
          </p>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="glass-card p-6">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs text-muted">累計獲得額</div>
              <div className="mt-1 text-xl font-bold text-primary">
                {formatJpy(summary.total_earned)}
              </div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs text-muted">未払い（ペンディング）</div>
              <div className="mt-1 text-xl font-bold text-primary">
                {formatJpy(summary.pending)}
              </div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs text-muted">今月の獲得額</div>
              <div className="mt-1 text-xl font-bold text-primary">
                {formatJpy(summary.this_month)}
              </div>
            </div>
          </div>

          {/* Filter */}
          <div className="glass-card p-4">
            <div className="flex flex-wrap items-end gap-4">
              <label className="space-y-1">
                <span className="text-xs text-muted">開始月</span>
                <input
                  type="month"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted">終了月</span>
                <input
                  type="month"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="input-field"
                />
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">期間</th>
                  <th className="px-4 py-3 font-medium">紹介先ショップ</th>
                  <th className="px-4 py-3 font-medium text-right">基本額</th>
                  <th className="px-4 py-3 font-medium text-right">料率</th>
                  <th className="px-4 py-3 font-medium text-right">
                    コミッション額
                  </th>
                  <th className="px-4 py-3 font-medium">ステータス</th>
                  <th className="px-4 py-3 font-medium">支払日</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-muted"
                    >
                      該当するコミッション履歴がありません。
                    </td>
                  </tr>
                ) : (
                  commissions.map((c) => {
                    const status = getStatusEntry(
                      AGENT_COMMISSION_STATUS_MAP,
                      c.status,
                    );
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border-default hover:bg-surface-hover/40 transition-colors"
                      >
                        <td className="px-4 py-3 text-primary">{c.period}</td>
                        <td className="px-4 py-3 text-primary">
                          {c.referral_shop_name}
                        </td>
                        <td className="px-4 py-3 text-right text-secondary">
                          {formatJpy(c.base_amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-secondary">
                          {(c.rate * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-primary">
                          {formatJpy(c.commission_amount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={status.variant}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-secondary">
                          {c.paid_at ? formatDateTime(c.paid_at) : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
