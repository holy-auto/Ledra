"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatJpy } from "@/lib/format";

type MonthlyRow = {
  month: string;
  referrals: number;
  contracted: number;
  commission_earned: number;
  commission_pending: number;
};

type ReportData = {
  monthly: MonthlyRow[];
  status_breakdown: Record<string, number>;
  totals: {
    referrals: number;
    contracted: number;
    conversion_rate: number;
    total_earned: number;
  };
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未対応",
  contacted: "連絡済み",
  in_negotiation: "商談中",
  trial: "トライアル",
  contracted: "契約成立",
  cancelled: "キャンセル",
  churned: "解約",
};

export default function AgentReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/agent/reports?months=${months}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [ready, months]);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          REPORTS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">レポート・分析</h1>
        <p className="mt-1 text-sm text-neutral-500">紹介実績・コミッション収益の詳細分析</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {[3, 6, 12, 24].map((m) => (
          <button
            key={m}
            onClick={() => setMonths(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              months === m ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {m}ヶ月
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-2xl bg-neutral-100" />
          <div className="h-64 rounded-2xl bg-neutral-100" />
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="紹介総数" value={String(data.totals.referrals)} />
            <SummaryCard label="契約成立" value={String(data.totals.contracted)} />
            <SummaryCard label="成約率" value={`${data.totals.conversion_rate}%`} />
            <SummaryCard label="累計コミッション" value={formatJpy(data.totals.total_earned)} />
          </div>

          {/* Monthly chart (bar representation) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">月別推移</h2>
            <div className="space-y-2">
              {data.monthly.map((m) => {
                const maxRef = Math.max(...data.monthly.map((r) => r.referrals), 1);
                const maxComm = Math.max(...data.monthly.map((r) => r.commission_earned), 1);
                return (
                  <div key={m.month} className="grid grid-cols-[80px_1fr_1fr_100px] items-center gap-3 text-xs">
                    <span className="font-mono text-neutral-500">{m.month}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-4 rounded bg-neutral-800" style={{ width: `${(m.referrals / maxRef) * 100}%`, minWidth: m.referrals > 0 ? 4 : 0 }} />
                      <span className="text-neutral-600">{m.referrals}件</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 rounded bg-emerald-500" style={{ width: `${(m.commission_earned / maxComm) * 100}%`, minWidth: m.commission_earned > 0 ? 4 : 0 }} />
                      <span className="text-neutral-600">{formatJpy(m.commission_earned)}</span>
                    </div>
                    <div className="text-right text-neutral-400">
                      契約 {m.contracted}件
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-neutral-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-neutral-800" /> 紹介数
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500" /> コミッション
              </span>
            </div>
          </div>

          {/* Status breakdown */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">ステータス内訳</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(data.status_breakdown).map(([status, count]) => (
                <div key={status} className="rounded-xl bg-neutral-50 p-3 text-center">
                  <div className="text-lg font-bold text-neutral-900">{count}</div>
                  <div className="text-xs text-neutral-500">{STATUS_LABELS[status] ?? status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CSV Export */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                const header = "月,紹介数,契約数,コミッション(承認済),コミッション(未払い)\n";
                const rows = data.monthly.map((m) =>
                  `${m.month},${m.referrals},${m.contracted},${m.commission_earned},${m.commission_pending}`
                ).join("\n");
                const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `agent-report-${months}m.csv`;
                a.click();
              }}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              CSVエクスポート
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          データを取得できませんでした
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-neutral-900">{value}</div>
    </div>
  );
}
