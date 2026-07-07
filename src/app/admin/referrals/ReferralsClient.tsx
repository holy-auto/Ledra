"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";

export type LeadRow = {
  id: string;
  vin_code_normalized: string;
  consumer_id: string;
  attributed_tenant_ids: string[] | null;
  status: string;
  sale_amount_jpy: number | null;
  referral_fee_jpy: number | null;
  partner_reference: string | null;
  queried_at: string;
  claimed_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  queried: "照会済み",
  claimed: "成約済み",
  rejected: "辞退",
  expired: "期限切れ",
};

const STATUS_TONE: Record<string, string> = {
  queried: "bg-amber-100 text-amber-800",
  claimed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-zinc-200 text-zinc-600",
  expired: "bg-zinc-200 text-zinc-600",
};

// ステータスタブ順（すべて + 4 ステータス）
const STATUS_ORDER = ["queried", "claimed", "rejected", "expired"] as const;
type StatusTab = "all" | (typeof STATUS_ORDER)[number];

function formatJpy(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

export default function ReferralsClient({
  leads,
  consumerNames,
}: {
  leads: LeadRow[];
  consumerNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<StatusTab>("all");

  const stats = useMemo(() => {
    const claimed = leads.filter((l) => l.status === "claimed");
    const claimedTotal = claimed.reduce((s, l) => s + (l.referral_fee_jpy ?? 0), 0);
    const myShare = claimed.reduce((s, l) => {
      const n = (l.attributed_tenant_ids ?? []).length;
      if (n === 0 || !l.referral_fee_jpy) return s;
      return s + Math.floor(l.referral_fee_jpy / n);
    }, 0);
    const counts: Record<string, number> = {};
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
    return { claimedCount: claimed.length, claimedTotal, myShare, counts };
  }, [leads]);

  const visibleLeads = useMemo(() => (tab === "all" ? leads : leads.filter((l) => l.status === tab)), [leads, tab]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-zinc-900">
      <PageHeader
        tag="紹介"
        title="パスポート紹介リード"
        meta={<span className="text-xs text-muted">照会 {leads.length} 件（直近100件）</span>}
        tabs={[
          { key: "all", label: "すべて", badge: leads.length },
          ...STATUS_ORDER.map((s) => ({
            key: s,
            label: STATUS_LABEL[s],
            badge: stats.counts[s] ?? 0,
          })),
        ]}
        activeTab={tab}
        onTabSelect={(k) => setTab(k as StatusTab)}
      />

      <p className="text-sm text-zinc-600">
        中古車店・買取業者が貴店の施工履歴付き車両を照会した時に lead が記録され、 partner
        が成約報告すると紹介手数料が発生します。
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">照会総数</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{leads.length}</div>
          <div className="mt-1 text-xs text-zinc-500">直近 100 件</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">成約件数</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{stats.claimedCount}</div>
          <div className="mt-1 text-xs text-zinc-500">claimed の lead</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">手数料総額</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatJpy(stats.claimedTotal)}</div>
          <div className="mt-1 text-xs text-zinc-500">全 attributed 店舗合計</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">貴店の取り分</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{formatJpy(stats.myShare)}</div>
          <div className="mt-1 text-xs text-emerald-700">等分配分後</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">最近の lead</h2>
        </div>
        {visibleLeads.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-zinc-500">
            {leads.length === 0 ? (
              <>
                まだ紹介リードはありません。
                <br />
                <span className="text-xs">中古車店等の partner が貴店の施工車両を照会すると、ここに記録されます。</span>
              </>
            ) : (
              "この条件の lead はありません。"
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">VIN末尾</th>
                  <th className="px-4 py-3 text-left">照会元</th>
                  <th className="px-4 py-3 text-center">ステータス</th>
                  <th className="px-4 py-3 text-right">売却額</th>
                  <th className="px-4 py-3 text-right">手数料</th>
                  <th className="px-4 py-3 text-right">貴店分</th>
                  <th className="px-4 py-3 text-right">照会日時</th>
                  <th className="px-4 py-3 text-right">成約日時</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((l) => {
                  const n = (l.attributed_tenant_ids ?? []).length;
                  const myFee = l.referral_fee_jpy && n > 0 ? Math.floor(l.referral_fee_jpy / n) : null;
                  return (
                    <tr key={l.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono">{l.vin_code_normalized.slice(-6)}</td>
                      <td className="px-4 py-3">{consumerNames[l.consumer_id] ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_TONE[l.status] ?? "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {STATUS_LABEL[l.status] ?? l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatJpy(l.sale_amount_jpy)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatJpy(l.referral_fee_jpy)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatJpy(myFee)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">{formatDateTime(l.queried_at)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {l.claimed_at ? formatDateTime(l.claimed_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="space-y-1 text-xs text-zinc-500">
        <p>※ 手数料は売却額の 0.5% で固定 (v1)。attributed 施工店間で均等に分配されます。</p>
        <p>※ partner からの成約報告は API (POST /api/v1/passport/referrals/claim) 経由です。</p>
      </footer>
    </main>
  );
}
