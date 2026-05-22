"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatTile from "@/components/analytics/StatTile";
import {
  ANALYTICS_WINDOW_LABEL,
  authenticityGradeLabel,
  type AnalyticsWindow,
  type StaffPerformanceResult,
  type StaffPerformanceRow,
} from "@/lib/analytics/staff";

type Props = {
  initial: StaffPerformanceResult;
};

const WINDOWS: AnalyticsWindow[] = ["30d", "90d", "365d", "all"];

function fmtNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function fmtPct(rate: number | null): string {
  if (rate === null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtRating(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)} / 5.0`;
}

function fmtMinutes(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n < 60) return `${Math.round(n)}分`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

function staffLabel(s: StaffPerformanceRow): string {
  return s.display_name?.trim() || s.email || s.user_id.slice(0, 8);
}

function roleLabel(role: string | null): string {
  switch (role) {
    case "owner":
      return "オーナー";
    case "admin":
      return "管理者";
    case "staff":
      return "スタッフ";
    case "viewer":
      return "閲覧";
    default:
      return role ?? "—";
  }
}

export default function StaffPerformanceClient({ initial }: Props) {
  const router = useRouter();
  const [data, setData] = useState<StaffPerformanceResult>(initial);
  const [window, setWindow] = useState<AnalyticsWindow>(initial.window);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeWindow(next: AnalyticsWindow) {
    if (next === window) return;
    setWindow(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/analytics/staff?window=${next}`, { cache: "no-store" });
        const json = (await res.json()) as StaffPerformanceResult & { error?: string; message?: string };
        if (!res.ok) {
          setError(json.message ?? "読み込みに失敗しました。");
          return;
        }
        setData(json);
        // Sync the query string for shareable URLs.
        router.replace(`/admin/analytics/staff?window=${next}`, { scroll: false });
      } catch {
        setError("通信に失敗しました。");
      }
    });
  }

  const topPerformers = useMemo(() => data.staff.slice(0, 3), [data.staff]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-zinc-900">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Analytics</p>
          <h1 className="text-2xl font-bold">スタッフ別パフォーマンス</h1>
          <p className="mt-1 text-sm text-zinc-600">
            証明書発行・予約・お客様レビュー・写真品質を担当者別に集計します。
          </p>
        </div>
        <div className="flex items-center gap-2" role="tablist" aria-label="期間">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={w === window}
              onClick={() => changeWindow(w)}
              disabled={pending}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                w === window
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {ANALYTICS_WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="活動中スタッフ" value={fmtNumber(data.totals.staff_with_activity)} hint="期間内に活動" />
        <StatTile label="証明書発行" value={fmtNumber(data.totals.total_cert_count)} hint="期間内合計" />
        <StatTile label="予約完了" value={fmtNumber(data.totals.total_reservations_completed)} hint="期間内完了" />
        <StatTile label="レビュー数" value={fmtNumber(data.totals.total_reviews)} hint="期間内受領" />
      </section>

      {topPerformers.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">トップパフォーマー</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {topPerformers.map((s, i) => (
              <div key={s.user_id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    #{i + 1} / {roleLabel(s.role)}
                  </span>
                </div>
                <div className="mt-1 truncate text-lg font-semibold">{staffLabel(s)}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">証明書</div>
                    <div className="font-semibold tabular-nums">{fmtNumber(s.cert_count)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">アンカー率</div>
                    <div className="font-semibold tabular-nums">{fmtPct(s.anchor_rate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">予約成約</div>
                    <div className="font-semibold tabular-nums">{fmtPct(s.reservation_close_rate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">レビュー</div>
                    <div className="font-semibold tabular-nums">{fmtRating(s.avg_review_rating)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">全スタッフ一覧</h2>
        </div>
        {data.staff.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-500">この期間に活動したスタッフがいません。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">スタッフ</th>
                  <th className="px-4 py-3 text-right">証明書</th>
                  <th className="px-4 py-3 text-right">アンカー率</th>
                  <th className="px-4 py-3 text-right">写真品質</th>
                  <th className="px-4 py-3 text-right">予約完了</th>
                  <th className="px-4 py-3 text-right">成約率</th>
                  <th className="px-4 py-3 text-right">平均施工時間</th>
                  <th className="px-4 py-3 text-right">顧客数</th>
                  <th className="px-4 py-3 text-right">リピート率</th>
                  <th className="px-4 py-3 text-right">レビュー</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => (
                  <tr key={s.user_id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{staffLabel(s)}</div>
                      <div className="text-xs text-zinc-500">
                        {roleLabel(s.role)}
                        {s.email ? ` · ${s.email}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(s.cert_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(s.anchor_rate)}</td>
                    <td className="px-4 py-3 text-right text-xs">{authenticityGradeLabel(s.avg_authenticity_grade)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(s.reservations_completed)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(s.reservation_close_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMinutes(s.avg_work_minutes)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNumber(s.distinct_customers)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(s.repeat_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.review_count > 0 ? (
                        <>
                          <span className="font-medium">{fmtRating(s.avg_review_rating)}</span>
                          <span className="ml-1 text-xs text-zinc-500">({fmtNumber(s.review_count)})</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-xs text-zinc-500">
        ※ 集計は証明書 / 予約 / レビューの担当者割り当て (`created_by` / `assigned_user_id`) に基づきます。
        担当者未割当てのレコードは含まれません。
      </footer>
    </main>
  );
}
