"use client";

import { useState } from "react";
import { useStripeAction } from "@/hooks/useStripeAction";
import { CheckoutErrorPanel } from "@/components/billing/CheckoutErrorPanel";

type Tier = {
  tier_key: string;
  label: string;
  description: string | null;
  price_jpy: number;
  scope: { type: "full" } | { type: "recent_months"; months: number };
};

type Props = {
  vin: string;
  tiers: Tier[];
  enabled: boolean;
  notice?: "canceled" | "pending" | null;
  sourcePublicId?: string;
  /** Render as a single inline button (used for the full-report upsell). */
  compact?: boolean;
  /** Restrict the offered tiers to this one key. */
  onlyTier?: string;
};

export default function PurchaseReportCard({ vin, tiers, enabled, notice, sourcePublicId, compact, onlyTier }: Props) {
  const [busyTier, setBusyTier] = useState<string | null>(null);
  // Retained across failures so the error panel's "try again" re-runs the same
  // tier (busyTier is cleared on failure and would be null in the callback).
  const [lastTier, setLastTier] = useState<string | null>(null);
  const checkout = useStripeAction<{ url: string }>("vehicle-report:checkout");

  const offered = onlyTier ? tiers.filter((t) => t.tier_key === onlyTier) : tiers;

  async function startCheckout(tierKey: string) {
    setLastTier(tierKey);
    setBusyTier(tierKey);
    const result = await checkout.execute(async () => {
      const res = await fetch("/api/public/vehicle-report/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, source_public_id: sourcePublicId, tier: tierKey }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.url) {
        const err = new Error(j?.message ?? j?.error ?? "決済の開始に失敗しました") as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return { url: j.url as string };
    });
    if (result.ok) {
      window.location.href = result.data.url;
    } else {
      setBusyTier(null);
    }
  }

  const priceLabel = (jpy: number) => `¥${jpy.toLocaleString("ja-JP")}`;

  // Compact: a single button (the full-report upsell shown to partial buyers).
  if (compact) {
    const t = offered[0];
    if (!t) return null;
    return (
      <button
        type="button"
        onClick={() => startCheckout(t.tier_key)}
        disabled={!enabled || busyTier !== null}
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busyTier === t.tier_key ? "決済ページへ移動中…" : `${t.label}（${priceLabel(t.price_jpy)}）`}
      </button>
    );
  }

  return (
    <div className="glass-card mb-4 p-6">
      {notice === "canceled" ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] px-4 py-3 text-sm text-amber-400">
          お支払いはキャンセルされました。レポートはまだ閲覧できません。
        </div>
      ) : null}
      {notice === "pending" ? (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-[rgba(59,130,246,0.1)] px-4 py-3 text-sm text-blue-400">
          お支払いの確認中です。完了後にこのページから履歴をご覧いただけます。
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-[rgba(59,130,246,0.1)]">
          <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-base font-bold text-primary">車両施工履歴レポート（有料）</div>
          <p className="mt-1 text-sm leading-6 text-secondary">
            この車両に紐づく<strong className="text-primary">施工店の施工履歴</strong>を、ブロックチェーン認証付きで 1
            つに集約したレポートです。中古車の査定・買取・保険査定の根拠資料としてご利用いただけます。 お支払いは 1
            回のみ・アカウント登録は不要です。
          </p>
        </div>
      </div>

      {checkout.error ? (
        <div className="mt-4">
          <CheckoutErrorPanel
            error={checkout.error}
            errorCode={checkout.errorCode}
            attempt={checkout.attempt}
            isPending={checkout.isPending}
            onRetry={() => (lastTier ? startCheckout(lastTier) : undefined)}
          />
        </div>
      ) : null}

      {/* Tier ladder */}
      <div className="mt-5 flex flex-col gap-3">
        {offered.length === 0 ? (
          <div className="text-sm text-muted">現在販売を停止しています。</div>
        ) : (
          offered.map((t) => (
            <div
              key={t.tier_key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-default bg-base p-4"
            >
              <div className="min-w-0">
                <div className="font-semibold text-primary">{t.label}</div>
                {t.description ? <div className="mt-0.5 text-xs text-muted">{t.description}</div> : null}
                <div className="mt-1 text-sm text-secondary">
                  <span className="text-lg font-bold text-primary">{priceLabel(t.price_jpy)}</span>
                  <span className="ml-1 text-xs text-muted">（税込）</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => startCheckout(t.tier_key)}
                disabled={!enabled || busyTier !== null}
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {!enabled ? "販売停止中" : busyTier === t.tier_key ? "決済ページへ移動中…" : "購入して見る"}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-border-default pt-3 text-xs text-muted">
        Ledra 加盟店の方は{" "}
        <a
          href={`/login?next=${encodeURIComponent(`/v/${vin}`)}`}
          className="font-semibold text-blue-400 hover:underline"
        >
          ログイン
        </a>{" "}
        すると、どの施工店で何を施工したかを無料でご確認いただけます。
      </div>
    </div>
  );
}
