"use client";

/**
 * Stripe Checkout / Portal / Connect 起動失敗時のエラーパネル。
 *
 * useStripeAction と組み合わせて使う:
 *
 *   const checkout = useStripeAction<{ url: string }>("billing:checkout");
 *   ...
 *   {checkout.error && (
 *     <CheckoutErrorPanel
 *       error={checkout.error}
 *       errorCode={checkout.errorCode}
 *       attempt={checkout.attempt}
 *       isPending={checkout.isPending}
 *       onRetry={handleCheckout}
 *     />
 *   )}
 *
 * 表示要素:
 * - エラー本文 (透過、技術詳細)
 * - エラーコード別のユーザー向け示唆 (getStripeErrorSuggestion)
 * - リトライボタン (attempt カウンタ表示で「○回目」明示)
 * - サポート連絡導線 (optional)
 */

import type { StripeErrorCode } from "@/hooks/useStripeAction";
import { getStripeErrorSuggestion } from "@/hooks/useStripeAction";

export interface CheckoutErrorPanelProps {
  error: string;
  errorCode: StripeErrorCode | null;
  attempt: number;
  isPending?: boolean;
  /** ユーザーが「もう一度試す」を押した時のコールバック */
  onRetry: () => void;
  /** 任意: サポート連絡先 (mailto: / 問い合わせフォーム URL) */
  supportHref?: string;
}

export function CheckoutErrorPanel({
  error,
  errorCode,
  attempt,
  isPending,
  onRetry,
  supportHref,
}: CheckoutErrorPanelProps) {
  const suggestion = getStripeErrorSuggestion(errorCode);
  const showSupport = errorCode === "client_error" || attempt >= 3;

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
    >
      <div className="font-semibold">決済画面の起動に失敗しました</div>
      <div className="mt-1 break-words text-red-800 dark:text-red-200">{error}</div>
      {suggestion && <div className="mt-2 text-red-700 dark:text-red-300">{suggestion}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "再試行中…" : `もう一度試す (${attempt} 回目)`}
        </button>
        {showSupport && supportHref && (
          <a
            href={supportHref}
            className="rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-200 dark:hover:bg-red-900/40"
          >
            サポートに連絡
          </a>
        )}
      </div>
    </div>
  );
}
