"use client";

/**
 * `/admin/jobs/[id]` — AI サジェストパネル。
 *
 * マウント時に POST /api/admin/jobs/[id]/ai-suggest を 1 回叩き、結果を 3 枚の
 * 軽量カードに展開する:
 *   - 推奨タイトル (PATCH 用ボタン付き)
 *   - 次アクションバナー (priority に応じた色 + 該当する admin URL へのリンク)
 *   - 作業時間乖離アラート (severity ≥ warn のみ表示)
 *
 * AI 不可 (プラン不足 / 無効 / 設定 OFF) の場合は静かに何も描画しない。
 * UI を踏み台に他コンポーネントを壊さないことを最優先。
 */
import { useEffect, useState } from "react";

interface TitleSuggestion {
  title: string;
  confidence: number;
  policy: "auto" | "suggest" | "manual";
}
interface NextActionSuggestion {
  action: string;
  message: string;
  priority: "high" | "med" | "low";
  ai: boolean;
  policy: "auto" | "suggest" | "manual";
}
interface TimerAlertSuggestion {
  severity: "ok" | "warn_over" | "alert_over" | "warn_short";
  message: string;
  deviationRatio: number;
  ai: boolean;
  policy: "auto" | "suggest" | "manual";
}

interface Suggestions {
  title: TitleSuggestion | null;
  nextAction: NextActionSuggestion | null;
  timerAlert: TimerAlertSuggestion | null;
}

interface ApiResponse {
  ok?: boolean;
  ai_disabled?: boolean;
  suggestions?: Suggestions;
  message?: string;
  code?: string;
}

interface Props {
  reservationId: string;
  currentTitle: string | null;
  customerId: string | null;
  vehicleId: string | null;
  /** 状態遷移時に保存済みの次アクション (job.auto_next_action)。マウント取得が返るまで即時表示する。 */
  initialNextAction?: NextActionSuggestion | null;
}

const PRIORITY_TONE: Record<"high" | "med" | "low", string> = {
  high: "border-red-300 bg-red-50 text-red-900",
  med: "border-amber-300 bg-amber-50 text-amber-900",
  low: "border-slate-300 bg-slate-50 text-slate-800",
};

const SEVERITY_TONE: Record<"warn_over" | "alert_over" | "warn_short", string> = {
  alert_over: "border-red-300 bg-red-50 text-red-900",
  warn_over: "border-amber-300 bg-amber-50 text-amber-900",
  warn_short: "border-blue-300 bg-blue-50 text-blue-900",
};

function nextActionHref(action: string, customerId: string | null, vehicleId: string | null): string | null {
  const params = new URLSearchParams();
  if (customerId) params.set("customer_id", customerId);
  if (vehicleId) params.set("vehicle_id", vehicleId);
  const qs = params.toString();
  switch (action) {
    case "link_customer":
      return customerId ? `/admin/customers/${customerId}` : "/admin/customers";
    case "link_vehicle":
      return vehicleId ? `/admin/vehicles/${vehicleId}` : "/admin/vehicles";
    case "issue_certificate":
      return `/admin/certificates/new${qs ? `?${qs}` : ""}`;
    case "create_invoice":
      return `/admin/invoices/new${qs ? `?${qs}` : ""}`;
    case "collect_payment":
      return "/admin/invoices";
    case "follow_up_overdue":
      return "/admin/invoices?status=overdue";
    case "send_thanks":
      return customerId ? `/admin/customers/${customerId}/messages` : null;
    case "start_work":
    case "cancel_or_close":
    default:
      return null;
  }
}

export default function JobAiSuggestPanel({
  reservationId,
  currentTitle,
  customerId,
  vehicleId,
  initialNextAction = null,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Suggestions | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/jobs/${reservationId}/ai-suggest`, { method: "POST" });
        if (res.status === 403) {
          // プラン不足 / 権限不足 → 静かに非表示
          if (!cancelled) setDisabled(true);
          return;
        }
        const json: ApiResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || json.ai_disabled) {
          setDisabled(true);
          return;
        }
        setData(json.suggestions ?? null);
      } catch {
        if (!cancelled) setDisabled(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  async function applyTitle(title: string) {
    setApplying(true);
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) setAppliedTitle(title);
    } catch {
      /* noop: 失敗時は UI 何もしない (ユーザは reload で確認可能) */
    } finally {
      setApplying(false);
    }
  }

  // 保存済みの次アクション (initialNextAction) があれば、取得完了前 / プラン不足時でも表示する。
  if (disabled && !initialNextAction) return null;
  if (loading && !initialNextAction) return null;
  if (!data && !initialNextAction) return null;

  const title = data?.title ?? null;
  const nextAction = data?.nextAction ?? initialNextAction;
  const timer = data?.timerAlert ?? null;

  const titleDiffers = title && title.title && title.title !== (currentTitle ?? "") && title.policy !== "manual";

  // 全部空ならパネルごと省略 (ノイズ抑制)
  const hasContent =
    titleDiffers ||
    (nextAction && nextAction.policy !== "manual" && nextAction.message) ||
    (timer && timer.severity !== "ok" && timer.policy !== "manual" && timer.message);
  if (!hasContent) return null;

  return (
    <section aria-label="AI 提案" className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-accent">
        <span>✨ AI 提案</span>
        <span className="text-muted text-[10px] font-normal">
          自動入力ポリシーで一部を非表示にできます (
          <a href="/admin/settings/ai-automation" className="underline">
            設定
          </a>
          )
        </span>
      </div>

      {titleDiffers && (
        <div className="rounded-lg border border-accent/20 bg-surface px-3 py-2">
          <div className="text-[11px] text-muted">
            推奨タイトル (信頼度 {Math.round((title?.confidence ?? 0) * 100)}%)
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="text-sm font-medium text-primary truncate">{title!.title}</div>
            {appliedTitle === title!.title ? (
              <span className="text-[11px] text-success-text">✓ 反映済み</span>
            ) : (
              <button
                type="button"
                className="btn-ghost text-[11px] py-1 px-2"
                disabled={applying}
                onClick={() => applyTitle(title!.title)}
              >
                {applying ? "..." : "タイトルを反映"}
              </button>
            )}
          </div>
        </div>
      )}

      {nextAction && nextAction.policy !== "manual" && nextAction.message && (
        <div className={`rounded-lg border px-3 py-2 ${PRIORITY_TONE[nextAction.priority]}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">{nextAction.message}</div>
            {(() => {
              const href = nextActionHref(nextAction.action, customerId, vehicleId);
              if (!href) return null;
              return (
                <a href={href} className="btn-ghost text-[11px] py-1 px-2 shrink-0">
                  開く →
                </a>
              );
            })()}
          </div>
        </div>
      )}

      {timer && timer.severity !== "ok" && timer.policy !== "manual" && timer.message && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            SEVERITY_TONE[timer.severity as "warn_over" | "alert_over" | "warn_short"]
          }`}
        >
          <div className="font-medium">
            ⏱ タイマー乖離: {timer.deviationRatio > 0 ? "+" : ""}
            {Math.round(timer.deviationRatio * 100)}%
          </div>
          <div className="mt-0.5">{timer.message}</div>
        </div>
      )}
    </section>
  );
}
