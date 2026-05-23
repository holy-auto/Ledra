"use client";

import { useState } from "react";
import { useStripeAction } from "@/hooks/useStripeAction";
import { CheckoutErrorPanel } from "@/components/billing/CheckoutErrorPanel";

type Props = {
  vin: string;
  priceJpy: number;
  enabled: boolean;
  notice?: "canceled" | "pending" | null;
  sourcePublicId?: string;
};

export default function PurchaseReportCard({ vin, priceJpy, enabled, notice, sourcePublicId }: Props) {
  const [busy, setBusy] = useState(false);
  const checkout = useStripeAction<{ url: string }>("vehicle-report:checkout");

  const priceLabel = `¥${priceJpy.toLocaleString("ja-JP")}`;

  async function startCheckout() {
    setBusy(true);
    const result = await checkout.execute(async () => {
      const res = await fetch("/api/public/vehicle-report/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, source_public_id: sourcePublicId }),
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
      setBusy(false);
    }
  }

  return (
    <div className="glass-card mb-4 p-6">
      {notice === "canceled" ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] px-4 py-3 text-sm text-amber-400">
          お支払いはキャンセルされました。全履歴レポートはまだ閲覧できません。
        </div>
      ) : null}
      {notice === "pending" ? (
        <div className="mb-4 rounded-xl border border-blue-500/30 bg-[rgba(59,130,246,0.1)] px-4 py-3 text-sm text-blue-400">
          お支払いの確認中です。完了後にこのページから全履歴をご覧いただけます。
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
          <div className="text-base font-bold text-primary">車両全履歴レポート（有料）</div>
          <p className="mt-1 text-sm leading-6 text-secondary">
            この車両に紐づく<strong className="text-primary">全施工店の施工履歴</strong>を、ブロックチェーン認証付きで 1
            つに集約したレポートです。中古車の査定・買取・保険査定の根拠資料としてご利用いただけます。 お支払いは 1
            回のみ・アカウント登録は不要です。
          </p>
          <ul className="mt-3 space-y-1 text-xs text-muted">
            <li>・各施工の Polygon トランザクション（改ざん検知）リンク</li>
            <li>・施工店名 / 施工種別 / 実施日のフルタイムライン</li>
            <li>・購入後 30 日間は何度でも閲覧可能</li>
          </ul>
        </div>
      </div>

      {checkout.error ? (
        <div className="mt-4">
          <CheckoutErrorPanel
            error={checkout.error}
            errorCode={checkout.errorCode}
            attempt={checkout.attempt}
            isPending={checkout.isPending}
            onRetry={startCheckout}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-secondary">
          価格: <span className="text-lg font-bold text-primary">{priceLabel}</span>
          <span className="ml-1 text-xs text-muted">（税込）</span>
        </div>
        <button
          type="button"
          onClick={startCheckout}
          disabled={busy || !enabled}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white no-underline transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {!enabled
            ? "現在販売を停止しています"
            : busy
              ? "決済ページへ移動中…"
              : `レポートを購入して全履歴を見る（${priceLabel}）`}
        </button>
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
