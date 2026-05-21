"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";

type Stage = "signed_up" | "shop_info" | "logo" | "first_record" | "first_cert" | "first_invoice";

type TenantRow = {
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string;
  created_at: string;
  days_since_signup: number;
  current_stage: Stage;
  current_stage_label: string;
  next_stage: Stage | null;
  next_stage_label: string | null;
};

type Data = {
  ok: boolean;
  range_days: number;
  total: number;
  tenants: TenantRow[];
};

const RANGES = [7, 30, 90] as const;

const STAGE_FILTERS: { value: Stage | "all"; label: string }[] = [
  { value: "all", label: "全段階" },
  { value: "signed_up", label: "サインアップ止まり" },
  { value: "shop_info", label: "店舗情報入力済み" },
  { value: "logo", label: "ロゴ設定済み" },
  { value: "first_record", label: "顧客/車両 登録済み" },
  { value: "first_cert", label: "初回証明書発行済み" },
  { value: "first_invoice", label: "完了 (初回請求書済み)" },
];

function stageColor(stage: Stage): string {
  switch (stage) {
    case "first_invoice":
      return "bg-success-dim text-success";
    case "first_cert":
      return "bg-accent-dim text-accent";
    case "first_record":
    case "logo":
      return "bg-warning-dim text-warning-text";
    case "shop_info":
    case "signed_up":
    default:
      return "bg-red-900/30 text-red-400";
  }
}

function daysColor(days: number, stage: Stage): string {
  if (stage === "first_invoice") return "text-muted";
  if (days >= 14) return "text-danger";
  if (days >= 7) return "text-warning-text";
  return "text-muted";
}

/**
 * テナント別オンボーディング進捗テーブル。
 *
 * 「どの施工店がどの段階で止まっているか」「サインアップから何日経過したか」
 * を一覧化し、運営側がフォロー対象を特定できるようにする。
 */
export default function OnboardingTenantsSection() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const [stage, setStage] = useState<Stage | "all">("all");

  const stageQuery = stage === "all" ? "" : `&stage=${stage}`;
  const {
    data,
    error: swrError,
    isLoading: loading,
  } = useSWR<Data>(`/api/admin/platform/onboarding-tenants?range=${range}${stageQuery}`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const err = swrError ? (swrError instanceof Error ? swrError.message : String(swrError)) : null;

  return (
    <section className="glass-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">ONBOARDING BY TENANT</div>
          <div className="mt-1 text-base font-semibold text-primary">テナント別オンボーディング状況</div>
          <p className="mt-1 text-xs text-muted">
            各施工店がオンボーディングのどの段階で止まっているかを一覧表示。経過日数が長いテナントは赤色で警告。
          </p>
        </div>
        <div className="flex rounded-lg border border-border-default overflow-hidden text-xs">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 transition-colors ${
                range === r ? "bg-accent text-white" : "bg-surface text-secondary hover:bg-surface-hover"
              }`}
            >
              {r}日
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {STAGE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStage(f.value)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              stage === f.value
                ? "bg-accent text-white border-accent"
                : "bg-surface text-secondary border-border-default hover:bg-surface-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-muted py-4">読み込み中…</div>}
      {err && <div className="text-sm text-danger py-2">{err}</div>}

      {data && !loading && (
        <>
          {data.total === 0 ? (
            <div className="text-sm text-muted py-4">該当するテナントはありません。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">テナント</th>
                    <th className="text-left p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">プラン</th>
                    <th className="text-left p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">
                      現在の到達段階
                    </th>
                    <th className="text-left p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">次のステップ</th>
                    <th className="text-right p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">経過日数</th>
                    <th className="text-left p-2.5 text-xs font-semibold tracking-[0.12em] text-muted">登録日</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t) => (
                    <tr
                      key={t.tenant_id}
                      className="border-t border-border-default hover:bg-surface-hover transition-colors"
                    >
                      <td className="p-2.5 text-primary font-semibold">{t.tenant_name ?? t.tenant_id.slice(0, 8)}</td>
                      <td className="p-2.5 text-secondary text-xs">{t.plan_tier}</td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs ${stageColor(t.current_stage)}`}
                        >
                          {t.current_stage_label}
                        </span>
                      </td>
                      <td className="p-2.5 text-secondary text-xs">
                        {t.next_stage_label ?? <span className="text-muted">—</span>}
                      </td>
                      <td className={`p-2.5 text-right text-xs ${daysColor(t.days_since_signup, t.current_stage)}`}>
                        {t.days_since_signup}日
                      </td>
                      <td className="p-2.5 text-secondary whitespace-nowrap text-xs">
                        {new Date(t.created_at).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border-default text-[11px] text-muted leading-relaxed">
            <strong className="text-primary">読み方:</strong>{" "}
            「現在の到達段階」は累積条件を満たした最後のステップ。経過日数が <strong>7日</strong> 以上で警告色、
            <strong>14日</strong> 以上で危険色になり、フォローアップ対象として目立つ表示になります。
          </div>
        </>
      )}
    </section>
  );
}
