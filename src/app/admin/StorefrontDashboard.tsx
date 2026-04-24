"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import BigActionButton from "@/components/pos/BigActionButton";
import POSSection from "@/components/pos/POSSection";
import { KanbanBoard, KanbanColumn } from "@/components/pos/KanbanBoard";
import KanbanCard from "@/components/pos/KanbanCard";
import { formatJpy } from "@/lib/format";

/**
 * StorefrontDashboard
 * ------------------------------------------------------------
 * 店頭モード (POS 風) のダッシュボード。
 *
 *  ① 今日の状況サマリ (3 秒で把握)
 *  ② 巨大アクションボタン 4 枚 (来店受付 / 飛び込み / 作業進行 / 会計)
 *  ③ 進行中ボード (受付済・作業中・会計待ち の 3 列カンバン)
 *  ④ 本日の予約リスト (時刻順、1タップ受付)
 *
 * 事務作業寄りの詳細操作は「管理モード」に切り替えて行う動線。
 */

type ReservationRow = {
  id: string;
  title: string;
  customer_name: string | null;
  vehicle_label: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number | null;
  workflow_template_id: string | null;
  current_step_key: string | null;
  progress_pct: number | null;
};

type ReservationsResponse = {
  reservations: ReservationRow[];
};

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "受付済み",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
};

export default function StorefrontDashboard() {
  const router = useRouter();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR<ReservationsResponse>("/api/admin/reservations", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const all = useMemo(() => data?.reservations ?? [], [data]);
  const d = today();

  const todays = useMemo(() => all.filter((r) => r.scheduled_date === d && r.status !== "cancelled"), [all, d]);
  const confirmedToday = useMemo(() => todays.filter((r) => r.status === "confirmed"), [todays]);
  const arrived = useMemo(() => all.filter((r) => r.status === "arrived"), [all]);
  const inProgress = useMemo(() => all.filter((r) => r.status === "in_progress"), [all]);
  const awaitingPayment = useMemo(
    () => all.filter((r) => r.status === "completed" && r.scheduled_date === d),
    [all, d],
  );

  const hasAnything = arrived.length + inProgress.length + awaitingPayment.length > 0;

  async function advance(reservationId: string) {
    setAdvancingId(reservationId);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/advance`, { method: "POST" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? j?.message ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancingId(null);
    }
  }

  async function checkInReservation(reservationId: string) {
    setAdvancingId(reservationId);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/advance`, { method: "POST" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? j?.message ?? `HTTP ${res.status}`);
      }
      await mutate();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancingId(null);
    }
  }

  const todayJa = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className="space-y-6">
      {/* ─── ① 今日の状況サマリ ──────────────────────── */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">TODAY</div>
            <div className="mt-0.5 text-xl font-bold text-primary">{todayJa}</div>
          </div>
          <dl className="flex flex-wrap items-center gap-4 text-sm">
            <div>
              <dt className="text-[11px] text-muted">本日の予約</dt>
              <dd className="text-xl font-bold text-primary">{todays.length}件</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">作業中</dt>
              <dd className="text-xl font-bold text-accent">{inProgress.length}件</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">会計待ち</dt>
              <dd className="text-xl font-bold text-warning">{awaitingPayment.length}件</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ─── ② 巨大アクションボタン 4 枚 ───────────────── */}
      <POSSection title="クイック操作" description="よく使う 4 つの入口を 1 タップで">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BigActionButton
            tone="primary"
            href="#todays-reservations"
            title="来店受付"
            subtitle="予約のお客様が来たら"
            hint={confirmedToday.length > 0 ? `未受付 ${confirmedToday.length}件` : "受付待ちなし"}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="neutral"
            href="/admin/jobs/new"
            title="飛び込み"
            subtitle="予約なしで案件を作成"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            }
          />
          <BigActionButton
            tone="warning"
            href="#ongoing-board"
            title="作業を進める"
            subtitle="進行中の案件を次へ"
            hint={
              inProgress.length + arrived.length > 0
                ? `${inProgress.length + arrived.length}件が待機中`
                : "対応待ちなし"
            }
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
                />
              </svg>
            }
          />
          <BigActionButton
            tone="success"
            href="#awaiting-payment"
            title="会計する"
            subtitle="完了した案件の請求"
            hint={awaitingPayment.length > 0 ? `${awaitingPayment.length}件が会計待ち` : "会計待ちなし"}
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
                />
              </svg>
            }
          />
        </div>
      </POSSection>

      {err && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim px-4 py-3 text-sm text-danger-text">{err}</div>
      )}

      {/* ─── ③ 進行中ボード ─────────────────────────── */}
      <section id="ongoing-board">
        <POSSection title="進行中ボード" description="カード右下の「次へ」で 1 タップ進行。LINE 通知も自動で飛びます">
          <KanbanBoard>
            <KanbanColumn
              label="受付済み"
              tone="primary"
              count={arrived.length}
              hint="作業開始を待っているお客様"
              emptyMessage={isLoading ? "読み込み中..." : "受付済みの案件はありません"}
            >
              {arrived.map((r) => (
                <KanbanCard
                  key={r.id}
                  href={`/admin/jobs/${r.id}`}
                  title={r.title}
                  meta={
                    <>
                      {r.customer_name && <div>{r.customer_name}</div>}
                      {r.vehicle_label && <div className="text-muted">{r.vehicle_label}</div>}
                    </>
                  }
                  footer={r.start_time ? `予約 ${r.start_time.slice(0, 5)}` : `予約日 ${r.scheduled_date}`}
                  primaryAction={{
                    label: "作業開始",
                    onClick: () => advance(r.id),
                    loading: advancingId === r.id,
                  }}
                />
              ))}
            </KanbanColumn>

            <KanbanColumn
              label="作業中"
              tone="warning"
              count={inProgress.length}
              hint="完了したら右下の「次へ」で進行"
              emptyMessage={isLoading ? "読み込み中..." : "作業中の案件はありません"}
            >
              {inProgress.map((r) => (
                <KanbanCard
                  key={r.id}
                  href={`/admin/jobs/${r.id}`}
                  title={r.title}
                  meta={
                    <>
                      {r.customer_name && <div>{r.customer_name}</div>}
                      {r.vehicle_label && <div className="text-muted">{r.vehicle_label}</div>}
                    </>
                  }
                  badge={
                    r.workflow_template_id && r.progress_pct != null ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-hover">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${r.progress_pct}%` }}
                          />
                        </span>
                        {r.progress_pct}%
                      </span>
                    ) : null
                  }
                  footer={r.current_step_key ? `現在: ${r.current_step_key}` : null}
                  primaryAction={{
                    label: "次へ進む",
                    onClick: () => advance(r.id),
                    loading: advancingId === r.id,
                  }}
                />
              ))}
            </KanbanColumn>

            <KanbanColumn
              label="会計待ち"
              tone="success"
              count={awaitingPayment.length}
              hint="作業完了。請求書作成 → 入金記録へ"
              emptyMessage={isLoading ? "読み込み中..." : "会計待ちの案件はありません"}
            >
              {awaitingPayment.map((r) => (
                <KanbanCard
                  key={r.id}
                  href={`/admin/jobs/${r.id}`}
                  title={r.title}
                  meta={
                    <>
                      {r.customer_name && <div>{r.customer_name}</div>}
                      {r.vehicle_label && <div className="text-muted">{r.vehicle_label}</div>}
                    </>
                  }
                  footer={r.estimated_amount ? `概算 ${formatJpy(r.estimated_amount)}` : null}
                  primaryAction={{
                    label: "請求書を作成",
                    onClick: () => {
                      const params = new URLSearchParams({ view: "invoice", create: "1" });
                      router.push(`/admin/invoices/new?${params.toString()}`);
                    },
                  }}
                />
              ))}
            </KanbanColumn>
          </KanbanBoard>
          {!isLoading && !hasAnything && (
            <p className="mt-3 text-center text-[12px] text-muted">
              進行中の案件はまだありません。来店受付 / 飛び込み から案件を追加してください。
            </p>
          )}
        </POSSection>
      </section>

      {/* ─── ④ 本日の予約 (時刻順) ──────────────────── */}
      <section id="todays-reservations">
        <POSSection title="本日の予約" description="お客様が来店したら行の右端で 1 タップ受付">
          {todays.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle bg-surface/40 px-4 py-10 text-center text-sm text-muted">
              {isLoading ? "読み込み中..." : "本日の予約はまだありません"}
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface">
              {todays.map((r) => {
                const isConfirmed = r.status === "confirmed";
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-16 shrink-0 text-center">
                      <div className="text-xs font-semibold text-secondary">
                        {r.start_time ? r.start_time.slice(0, 5) : "--:--"}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-primary">{r.title}</div>
                      <div className="truncate text-[12px] text-muted">
                        {[r.customer_name, r.vehicle_label].filter(Boolean).join(" / ") || "顧客未設定"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-inset px-2 py-0.5 text-[11px] font-semibold text-secondary">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {isConfirmed ? (
                      <button
                        type="button"
                        onClick={() => checkInReservation(r.id)}
                        disabled={advancingId === r.id}
                        className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {advancingId === r.id ? "受付中..." : "来店受付"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/jobs/${r.id}`)}
                        className="shrink-0 rounded-lg border border-border-default bg-surface px-3 py-2 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface-hover"
                      >
                        案件を開く
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </POSSection>
      </section>

      {/* 会計待ちセクション (アンカー用) */}
      <section id="awaiting-payment" className="sr-only" aria-hidden="true" />
    </div>
  );
}
