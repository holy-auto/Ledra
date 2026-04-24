"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import BigActionButton from "@/components/pos/BigActionButton";
import POSSection from "@/components/pos/POSSection";
import { KanbanBoard, KanbanColumn } from "@/components/pos/KanbanBoard";
import KanbanCard from "@/components/pos/KanbanCard";
import { fetcher } from "@/lib/swr";
import { formatJpy } from "@/lib/format";

/**
 * StorefrontReservations
 * ------------------------------------------------------------
 * 店頭モードの予約一覧。
 *
 *  ① 日付範囲セレクタ (本日 / 明日 / 今週) + 新規登録ボタン
 *  ② 4 列カンバン (予約確定 / 受付済 / 作業中 / 完了)
 *  ③ 各カードに「次のステップに進む」1 タップボタン
 *
 * 複雑な検索・編集はサイドバーの管理モードで行う動線。
 */

type Reservation = {
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

type ApiResponse = { reservations: Reservation[] };

type RangeKey = "today" | "tomorrow" | "week";

const RANGE_OPTIONS: { key: RangeKey; label: string; hint: string }[] = [
  { key: "today", label: "本日", hint: "今日の予約だけ表示" },
  { key: "tomorrow", label: "明日", hint: "明日の予約を確認" },
  { key: "week", label: "今週", hint: "今週分の予約をまとめて表示" },
];

const ADVANCE_LABEL: Record<string, string> = {
  confirmed: "来店受付",
  arrived: "作業を開始",
  in_progress: "作業を完了",
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function dateRange(range: RangeKey): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (range === "today") return { start: isoDate(now), end: isoDate(now) };
  if (range === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return { start: isoDate(t), end: isoDate(t) };
  }
  // week (月〜日)
  const day = now.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function inRange(dateStr: string, range: { start: string; end: string }): boolean {
  return dateStr >= range.start && dateStr <= range.end;
}

function fmtTime(start: string | null, end: string | null, date: string): string {
  const d = new Date(date + "T00:00:00").toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  if (!start) return d;
  const t = end ? `${start}〜${end}` : start;
  return `${d} ${t}`;
}

export default function StorefrontReservations() {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("today");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data, mutate, isLoading } = useSWR<ApiResponse>("/api/admin/reservations", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const all = useMemo(() => data?.reservations ?? [], [data]);
  const r = useMemo(() => dateRange(range), [range]);

  const filtered = useMemo(() => all.filter((x) => x.status !== "cancelled" && inRange(x.scheduled_date, r)), [all, r]);

  const confirmed = useMemo(() => filtered.filter((x) => x.status === "confirmed"), [filtered]);
  const arrived = useMemo(() => filtered.filter((x) => x.status === "arrived"), [filtered]);
  const inProgress = useMemo(() => filtered.filter((x) => x.status === "in_progress"), [filtered]);
  const completed = useMemo(() => filtered.filter((x) => x.status === "completed"), [filtered]);

  // 本日の未受付（range に関わらず常に表示）
  const todayKey = useMemo(() => dateRange("today").start, []);
  const todayUnreceived = useMemo(
    () => all.filter((x) => x.status === "confirmed" && x.scheduled_date === todayKey),
    [all, todayKey],
  );

  async function advance(id: string) {
    const snapshot = data;
    // 楽観的更新：ステータスを次の段階に即時反映
    if (snapshot) {
      const next = snapshot.reservations.map((x) => {
        if (x.id !== id) return x;
        const nextStatus =
          x.status === "confirmed"
            ? "arrived"
            : x.status === "arrived"
              ? "in_progress"
              : x.status === "in_progress"
                ? "completed"
                : x.status;
        return { ...x, status: nextStatus };
      });
      mutate({ reservations: next }, { revalidate: false });
    }
    setAdvancingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/reservations/${id}/advance`, { method: "POST" });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? j?.message ?? `HTTP ${res.status}`);
      }
      // 背後でサーバ状態と再同期
      mutate();
    } catch (e: unknown) {
      if (snapshot) mutate(snapshot, { revalidate: false });
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── 日付範囲 + 新規作成 ─── */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface p-3">
        <div
          role="tablist"
          aria-label="表示範囲"
          className="flex items-center gap-0.5 rounded-full border border-border-subtle bg-inset p-0.5"
        >
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={active}
                title={opt.hint}
                onClick={() => setRange(opt.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active ? "bg-accent text-white" : "text-secondary hover:text-primary"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">
            {filtered.length} 件 {isLoading ? "(更新中...)" : ""}
          </span>
          <button
            type="button"
            onClick={() => router.push("/admin/jobs/new")}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            飛び込み案件
          </button>
        </div>
      </section>

      {err && (
        <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">{err}</div>
      )}

      {/* ─── 本日の未受付（最優先で表示） ─── */}
      {todayUnreceived.length > 0 && (
        <POSSection title={`本日の未受付 (${todayUnreceived.length}件)`} description="1 タップで受付完了にできます">
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {todayUnreceived.map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning-dim p-4"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/admin/jobs/${x.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-lg font-bold text-warning-text">
                    {x.customer_name || x.title || "(無題)"}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-warning-text/80">
                    {x.vehicle_label ? `${x.vehicle_label} · ` : ""}
                    {fmtTime(x.start_time, x.end_time, x.scheduled_date)}
                  </div>
                  {x.estimated_amount != null && (
                    <div className="mt-0.5 text-[11px] text-warning-text/70">見積 {formatJpy(x.estimated_amount)}</div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => advance(x.id)}
                  disabled={advancingId === x.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {advancingId === x.id ? "受付中..." : "受付完了"}
                </button>
              </li>
            ))}
          </ul>
        </POSSection>
      )}

      {/* ─── カンバン ─── */}
      <POSSection title="進行状況ボード" description="カードの「次へ進む」で 1 タップ更新" compact>
        <KanbanBoard>
          <KanbanColumn
            label="予約確定"
            tone="primary"
            count={confirmed.length}
            hint="来店をお待ちしています"
            emptyMessage="未来店の予約はありません"
          >
            {confirmed.map((x) => (
              <KanbanCard
                key={x.id}
                href={`/admin/jobs/${x.id}`}
                title={x.customer_name || x.title || "(無題)"}
                meta={fmtTime(x.start_time, x.end_time, x.scheduled_date)}
                badge={x.vehicle_label ?? undefined}
                footer={x.estimated_amount != null ? formatJpy(x.estimated_amount) : undefined}
                primaryAction={{
                  label: advancingId === x.id ? "更新中..." : ADVANCE_LABEL.confirmed,
                  onClick: () => advance(x.id),
                  disabled: advancingId === x.id,
                }}
              />
            ))}
          </KanbanColumn>
          <KanbanColumn
            label="受付済み"
            tone="warning"
            count={arrived.length}
            hint="作業を開始してください"
            emptyMessage="受付済みの案件はありません"
          >
            {arrived.map((x) => (
              <KanbanCard
                key={x.id}
                href={`/admin/jobs/${x.id}`}
                title={x.customer_name || x.title || "(無題)"}
                meta={fmtTime(x.start_time, x.end_time, x.scheduled_date)}
                badge={x.vehicle_label ?? undefined}
                footer={x.estimated_amount != null ? formatJpy(x.estimated_amount) : undefined}
                primaryAction={{
                  label: advancingId === x.id ? "更新中..." : ADVANCE_LABEL.arrived,
                  onClick: () => advance(x.id),
                  disabled: advancingId === x.id,
                }}
              />
            ))}
          </KanbanColumn>
          <KanbanColumn
            label="作業中"
            tone="primary"
            count={inProgress.length}
            hint="完了したら次へ進めましょう"
            emptyMessage="作業中の案件はありません"
          >
            {inProgress.map((x) => (
              <KanbanCard
                key={x.id}
                href={`/admin/jobs/${x.id}`}
                title={x.customer_name || x.title || "(無題)"}
                meta={
                  x.current_step_key
                    ? `ステップ: ${x.current_step_key}`
                    : fmtTime(x.start_time, x.end_time, x.scheduled_date)
                }
                badge={x.vehicle_label ?? undefined}
                footer={x.progress_pct != null ? `進捗 ${x.progress_pct}%` : undefined}
                primaryAction={{
                  label: advancingId === x.id ? "更新中..." : ADVANCE_LABEL.in_progress,
                  onClick: () => advance(x.id),
                  disabled: advancingId === x.id,
                }}
              />
            ))}
          </KanbanColumn>
          <KanbanColumn
            label="完了"
            tone="success"
            count={completed.length}
            hint="会計・証明書発行へ"
            emptyMessage="完了した案件はありません"
          >
            {completed.map((x) => (
              <KanbanCard
                key={x.id}
                href={`/admin/jobs/${x.id}`}
                title={x.customer_name || x.title || "(無題)"}
                meta={fmtTime(x.start_time, x.end_time, x.scheduled_date)}
                badge={x.vehicle_label ?? undefined}
                footer={x.estimated_amount != null ? formatJpy(x.estimated_amount) : undefined}
              />
            ))}
          </KanbanColumn>
        </KanbanBoard>
      </POSSection>

      {/* ─── 案内 ─── */}
      <section className="rounded-2xl border border-dashed border-border-subtle bg-inset/60 p-4 text-sm text-secondary">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">ヒント</div>
        複雑な条件で検索したり、個別に編集したい場合はサイドバー右上の
        <span className="mx-1 inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[11px] font-semibold text-primary">
          管理
        </span>
        モードに切り替えてください。
        <div className="mt-2">
          <BigActionButton
            tone="neutral"
            href="/admin/jobs/new"
            title="飛び込み案件を今すぐ作成"
            subtitle="予約なしで案件を開始"
            icon={
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            }
          />
        </div>
      </section>
    </div>
  );
}
