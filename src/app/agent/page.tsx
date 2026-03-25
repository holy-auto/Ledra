"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { AGENT_REFERRAL_STATUS_MAP, getStatusEntry } from "@/lib/statusMaps";
import { formatJpy } from "@/lib/format";
import { formatDateTime } from "@/lib/format";

/* ── Types ── */

type Referral = {
  id: string;
  shop_name: string;
  contact_name: string;
  status: string;
  created_at: string;
};

type MonthlyCommission = {
  month: string;       // "2026-01" etc.
  total_amount: number;
};

type DashboardData = {
  agent_name: string;
  agent_status: string;
  total_referrals: number;
  contracted_referrals: number;
  this_month_commission: number;
  total_commission: number;
  conversion_rate: number;
  unread_announcements: number;
  recent_referrals: Referral[];
  monthly_commissions: MonthlyCommission[];
};

/* ── Skeleton ── */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-neutral-200 ${className}`} />;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-neutral-900">{value}</div>
      {sub && <div className="mt-1 text-sm text-neutral-500">{sub}</div>}
    </div>
  );
}

/* ── Page ── */

export default function AgentDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        window.location.href = "/agent/login";
        return;
      }
      setReady(true);

      try {
        const res = await fetch("/api/agent/dashboard", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "fetch_failed");
        setData(j);
      } catch (e: any) {
        setErr(e?.message ?? "fetch_failed");
      }
    })();
  }, [supabase]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/agent/login";
  };

  if (!ready) return null;

  const isPending = data?.agent_status === "active_pending_review";

  /* Monthly chart max for scaling bars */
  const chartMax = data?.monthly_commissions?.length
    ? Math.max(...data.monthly_commissions.map((m) => m.total_amount), 1)
    : 1;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── Header ── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              AGENT PORTAL
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                {data ? `${data.agent_name} さん、おかえりなさい` : "ダッシュボード"}
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                代理店パートナー管理画面 — 紹介・コミッション状況を確認できます。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <a
              href="/agent/referrals/new"
              className="btn-primary"
            >
              新規紹介を作成
            </a>
            <button
              onClick={onLogout}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ログアウト
            </button>
          </div>
        </header>

        {/* ── Pending Review Banner ── */}
        {isPending && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold">!</div>
              <div>
                <div className="text-sm font-semibold text-amber-800">仮登録中</div>
                <p className="mt-1 text-sm text-amber-700">
                  現在アカウントは審査待ちの仮登録状態です。紹介の登録・閲覧はご利用いただけますが、
                  コミッションの支払いは正式承認後に開始されます。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        )}

        {/* ── Loading Skeleton ── */}
        {!data && !err && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* ── KPI Stat Cards ── */}
        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="紹介総数"
                value={String(data.total_referrals)}
                sub="全期間の紹介件数"
              />
              <StatCard
                label="契約成立数"
                value={String(data.contracted_referrals)}
                sub={`成約率 ${(data.conversion_rate * 100).toFixed(1)}%`}
              />
              <StatCard
                label="今月のコミッション"
                value={formatJpy(data.this_month_commission)}
                sub="当月発生分"
              />
              <StatCard
                label="累計コミッション"
                value={formatJpy(data.total_commission)}
                sub="全期間合計"
              />
            </div>

            {/* ── Announcements + Conversion Row ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CONVERSION</div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {(data.conversion_rate * 100).toFixed(1)}%
                </div>
                <div className="mt-3 h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${Math.min(data.conversion_rate * 100, 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-sm text-neutral-500">
                  {data.contracted_referrals} / {data.total_referrals} 件が契約成立
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ANNOUNCEMENTS</div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">
                  {data.unread_announcements}
                </div>
                <div className="mt-1 text-sm text-neutral-500">未読のお知らせ</div>
                {data.unread_announcements > 0 && (
                  <a
                    href="/agent/announcements"
                    className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
                  >
                    お知らせを確認する
                  </a>
                )}
              </div>
            </div>

            {/* ── Recent Referrals Table ── */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">RECENT REFERRALS</div>
                  <div className="mt-1 text-base font-semibold text-neutral-900">最近の紹介</div>
                </div>
                <a
                  href="/agent/referrals"
                  className="text-sm font-medium text-accent hover:underline"
                >
                  すべて表示
                </a>
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="p-3 text-left font-semibold text-neutral-600">店舗名</th>
                      <th className="p-3 text-left font-semibold text-neutral-600">担当者名</th>
                      <th className="p-3 text-left font-semibold text-neutral-600">ステータス</th>
                      <th className="p-3 text-left font-semibold text-neutral-600">作成日時</th>
                      <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_referrals.map((r) => {
                      const s = getStatusEntry(AGENT_REFERRAL_STATUS_MAP, r.status);
                      return (
                        <tr key={r.id} className="border-t hover:bg-neutral-50">
                          <td className="p-3 font-medium text-neutral-900">{r.shop_name}</td>
                          <td className="p-3 text-neutral-600">{r.contact_name || "-"}</td>
                          <td className="p-3">
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </td>
                          <td className="p-3 whitespace-nowrap text-neutral-600">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="p-3">
                            <a
                              href={`/agent/referrals/${encodeURIComponent(r.id)}`}
                              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                              詳細
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                    {data.recent_referrals.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-sm text-neutral-500">
                          紹介がまだありません。「新規紹介を作成」から始めましょう。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Monthly Commission Chart ── */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">MONTHLY COMMISSION</div>
                <div className="mt-1 text-base font-semibold text-neutral-900">月別コミッション推移</div>
              </div>

              {data.monthly_commissions.length > 0 ? (
                <div className="flex items-end gap-2 h-48">
                  {data.monthly_commissions.map((m) => {
                    const pct = (m.total_amount / chartMax) * 100;
                    return (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                        <div className="text-[10px] font-medium text-neutral-600">
                          {formatJpy(m.total_amount)}
                        </div>
                        <div className="w-full flex items-end" style={{ height: "160px" }}>
                          <div
                            className="w-full rounded-t-md bg-accent transition-all"
                            style={{ height: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-neutral-500 whitespace-nowrap">
                          {m.month.slice(5)}月
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-neutral-500">
                  コミッションデータがまだありません。
                </div>
              )}
            </section>

            {/* ── Quick Links ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                href="/agent/referrals/new"
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-accent hover:shadow-md transition-all group"
              >
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 group-hover:text-accent">
                  NEW REFERRAL
                </div>
                <div className="mt-2 text-base font-semibold text-neutral-900">新規紹介を作成</div>
                <p className="mt-1 text-sm text-neutral-500">
                  新しい施工店をCARTRUSTに紹介します。
                </p>
              </a>
              <a
                href="/agent/commissions"
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-accent hover:shadow-md transition-all group"
              >
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 group-hover:text-accent">
                  COMMISSIONS
                </div>
                <div className="mt-2 text-base font-semibold text-neutral-900">コミッション一覧</div>
                <p className="mt-1 text-sm text-neutral-500">
                  支払い履歴と明細を確認できます。
                </p>
              </a>
            </div>
          </>
        )}

      </div>
    </main>
  );
}
