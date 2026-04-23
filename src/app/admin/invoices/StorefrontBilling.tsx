"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import BigActionButton from "@/components/pos/BigActionButton";
import POSSection from "@/components/pos/POSSection";
import { fetcher } from "@/lib/swr";
import { formatDate, formatJpy } from "@/lib/format";

/**
 * StorefrontBilling
 * ------------------------------------------------------------
 * 店頭モードの請求・帳票ハブ。
 *
 *  ① 金額サマリ (未回収・今月発行)
 *  ② 巨大ボタン: 請求書作成 / 見積作成 / 領収書作成 / 一覧
 *  ③ 未入金リスト (1 タップで「入金済み」に更新)
 *
 * 全帳票検索・種別フィルタ等の細かい操作は管理モードで行う。
 */

type Invoice = {
  id: string;
  doc_number: string | null;
  status: string;
  total: number | null;
  issued_at: string | null;
  due_date: string | null;
  customer_name: string | null;
};

type Stats = {
  total: number;
  unpaid_amount: number;
  this_month_issued: number;
};

type ApiResponse = { invoices: Invoice[]; stats: Stats };

export default function StorefrontBilling() {
  const [paying, setPaying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR<ApiResponse>("/api/admin/invoices?per_page=100", fetcher, {
    refreshInterval: 30_000,
  });

  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const stats = data?.stats;

  const unpaid = useMemo(() => invoices.filter((i) => i.status === "sent" || i.status === "overdue"), [invoices]);

  async function markPaid(id: string) {
    setPaying(id);
    setErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/admin/invoices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "paid", payment_date: today }),
      });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── ① サマリ ─── */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">未回収</div>
            <div className="mt-1 text-2xl font-bold text-warning">{stats ? formatJpy(stats.unpaid_amount) : "—"}</div>
            <div className="mt-0.5 text-[11px] text-muted">{unpaid.length} 件 未入金</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">今月発行</div>
            <div className="mt-1 text-2xl font-bold text-primary">{stats?.this_month_issued ?? "—"}</div>
            <div className="mt-0.5 text-[11px] text-muted">今月の請求書</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">累計</div>
            <div className="mt-1 text-2xl font-bold text-primary">{stats?.total ?? "—"}</div>
            <div className="mt-0.5 text-[11px] text-muted">請求書 累計</div>
          </div>
        </div>
      </section>

      {/* ─── ② 大型ボタン ─── */}
      <POSSection title="会計・帳票作成" description="よく使う 4 つの入口を 1 タップで">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BigActionButton
            tone="primary"
            href="/admin/invoices/new"
            title="請求書を作成"
            subtitle="顧客への請求書"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="neutral"
            href="/admin/documents/new?type=estimate"
            title="見積書を作成"
            subtitle="施工前のお見積り"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="success"
            href="/admin/documents/new?type=receipt"
            title="領収書を作成"
            subtitle="入金済みのお客様に"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="neutral"
            href="/admin/invoices?view=invoice"
            title="請求書一覧を見る"
            subtitle="検索・編集・PDF出力"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
                />
              </svg>
            }
          />
        </div>
      </POSSection>

      {err && (
        <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">{err}</div>
      )}

      {/* ─── ③ 未入金リスト ─── */}
      <POSSection
        title="未入金の請求書"
        description={unpaid.length > 0 ? "「入金を記録」で今日を支払日として確定します" : "未入金の請求書はありません"}
        compact
      >
        {isLoading && invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface/40 p-6 text-center text-sm text-muted">
            読み込み中...
          </div>
        ) : unpaid.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-subtle bg-surface/40 p-6 text-center text-sm text-muted">
            すべての請求書が入金済みです
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {unpaid.slice(0, 12).map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="truncate text-sm font-bold text-primary hover:underline"
                    >
                      {inv.customer_name ?? "(顧客未設定)"}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="font-mono">{inv.doc_number ?? inv.id.slice(0, 8)}</span>
                      {inv.issued_at && <span>発行: {formatDate(inv.issued_at)}</span>}
                      {inv.due_date && (
                        <span className={inv.status === "overdue" ? "font-semibold text-danger-text" : ""}>
                          期限: {formatDate(inv.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">{formatJpy(inv.total)}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-warning-text">
                      {inv.status === "overdue" ? "期限超過" : "未入金"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => markPaid(inv.id)}
                  disabled={paying === inv.id}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {paying === inv.id ? "更新中..." : "入金を記録 (本日)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </POSSection>
    </div>
  );
}
