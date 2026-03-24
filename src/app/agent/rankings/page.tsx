"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatJpy } from "@/lib/format";

type RankingItem = {
  rank: number;
  agent_name: string;
  is_self: boolean;
  referral_count: number;
  contracted_count: number;
  conversion_rate: number;
  total_commission: number | null;
};

export default function AgentRankingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [selfRank, setSelfRank] = useState<RankingItem | null>(null);
  const [period, setPeriod] = useState("month");

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
      const res = await fetch(`/api/agent/rankings?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setRankings(json.rankings ?? []);
        setSelfRank(json.self_rank ?? null);
      }
      setLoading(false);
    })();
  }, [ready, period]);

  if (!ready) return null;

  const PERIOD_LABELS: Record<string, string> = { month: "今月", quarter: "四半期", year: "年間" };

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          RANKINGS
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">ランキング</h1>
        <p className="mt-1 text-sm text-neutral-500">代理店パートナーの実績ランキング（匿名）</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              period === key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Own rank highlight */}
      {selfRank && (
        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-xl font-bold text-white">
              {selfRank.rank}
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">あなたの順位</div>
              <div className="mt-1 flex flex-wrap gap-4 text-sm">
                <span>紹介 <strong>{selfRank.referral_count}</strong>件</span>
                <span>契約 <strong>{selfRank.contracted_count}</strong>件</span>
                <span>成約率 <strong>{selfRank.conversion_rate}%</strong></span>
                {selfRank.total_commission !== null && (
                  <span>コミッション <strong>{formatJpy(selfRank.total_commission)}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : rankings.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          まだランキングデータがありません
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-3 text-center font-semibold text-neutral-500 w-16">順位</th>
                <th className="p-3 text-left font-semibold text-neutral-500">代理店</th>
                <th className="p-3 text-right font-semibold text-neutral-500">紹介数</th>
                <th className="p-3 text-right font-semibold text-neutral-500">契約数</th>
                <th className="p-3 text-right font-semibold text-neutral-500">成約率</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr
                  key={r.rank}
                  className={`border-t border-neutral-100 ${r.is_self ? "bg-amber-50/50 font-semibold" : "hover:bg-neutral-50"}`}
                >
                  <td className="p-3 text-center">
                    {r.rank <= 3 ? (
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                        r.rank === 1 ? "bg-amber-400" : r.rank === 2 ? "bg-neutral-400" : "bg-amber-700"
                      }`}>
                        {r.rank}
                      </span>
                    ) : (
                      <span className="text-neutral-500">{r.rank}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={r.is_self ? "text-amber-700" : "text-neutral-900"}>
                      {r.agent_name}
                      {r.is_self && " (あなた)"}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-neutral-700">{r.referral_count}</td>
                  <td className="p-3 text-right font-mono text-neutral-700">{r.contracted_count}</td>
                  <td className="p-3 text-right font-mono text-neutral-700">{r.conversion_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
