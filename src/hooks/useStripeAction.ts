"use client";

/**
 * Stripe API 呼び出し (Checkout / Portal / Connect 起動等) の client 側
 * エラーハンドリング統一 hook。
 *
 * 提供する機能:
 * - error / errorCode (network / timeout / rate_limited / 5xx / 4xx / unknown) の分類
 * - attempt カウンタ (UI で「○回目の試行」を表示)
 * - Sentry breadcrumb + captureException 自動連携
 * - reset でエラー状態クリア
 *
 * 使い方:
 *
 *   const checkout = useStripeAction<{ url: string }>("billing:checkout");
 *   const onClick = async () => {
 *     const r = await checkout.execute(async () => {
 *       const res = await fetch("/api/stripe/checkout", { ... });
 *       const j = await res.json();
 *       if (!res.ok) throw { status: res.status, message: j?.error };
 *       return j;
 *     });
 *     if (r.ok) window.location.href = r.data.url;
 *   };
 *
 *   {checkout.error && (
 *     <CheckoutErrorPanel
 *       error={checkout.error}
 *       errorCode={checkout.errorCode}
 *       attempt={checkout.attempt}
 *       onRetry={onClick}
 *     />
 *   )}
 */

import { useCallback, useState } from "react";

export type StripeErrorCode = "network" | "timeout" | "rate_limited" | "server_error" | "client_error" | "unknown";

interface StripeActionState<T> {
  isPending: boolean;
  error: string | null;
  errorCode: StripeErrorCode | null;
  attempt: number;
  data: T | null;
}

interface StripeError {
  status?: number;
  message?: string;
}

function classifyError(e: unknown): StripeErrorCode {
  if (e && typeof e === "object") {
    const err = e as StripeError & { name?: string; code?: string };
    if (err.name === "AbortError" || err.code === "ETIMEDOUT") return "timeout";
    if (err.code === "ECONNRESET" || err.code === "ENOTFOUND") return "network";
    if (typeof err.status === "number") {
      if (err.status === 429) return "rate_limited";
      if (err.status >= 500) return "server_error";
      if (err.status >= 400) return "client_error";
    }
    const msg = err.message ?? "";
    if (/fetch failed|network/i.test(msg)) return "network";
    if (/timeout/i.test(msg)) return "timeout";
  }
  return "unknown";
}

async function captureToSentry(name: string, e: unknown, attempt: number): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.withScope((scope) => {
      scope.setTag("stripe_action", name);
      scope.setTag("attempt", String(attempt));
      scope.setLevel("warning");
      Sentry.captureException(e);
    });
  } catch {
    // Sentry load 失敗は握りつぶし
  }
}

export type StripeActionResult<T> = { ok: true; data: T } | { ok: false; error: string; errorCode: StripeErrorCode };

/**
 * Stripe API 呼び出しの共通 hook。
 * 1 つの "action name" (e.g. "billing:checkout") に紐付く state を管理する。
 */
export function useStripeAction<T>(name: string) {
  const [state, setState] = useState<StripeActionState<T>>({
    isPending: false,
    error: null,
    errorCode: null,
    attempt: 0,
    data: null,
  });

  const execute = useCallback(
    async (fn: () => Promise<T>): Promise<StripeActionResult<T>> => {
      const nextAttempt = state.attempt + 1;
      setState((s) => ({ ...s, isPending: true, error: null, errorCode: null, attempt: nextAttempt }));
      try {
        const data = await fn();
        setState((s) => ({ ...s, isPending: false, data }));
        return { ok: true, data };
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : typeof e === "object" && e ? JSON.stringify(e) : String(e);
        const errorCode = classifyError(e);
        void captureToSentry(name, e, nextAttempt);
        setState((s) => ({ ...s, isPending: false, error, errorCode }));
        return { ok: false, error, errorCode };
      }
    },
    [name, state.attempt],
  );

  const reset = useCallback(() => {
    setState({ isPending: false, error: null, errorCode: null, attempt: 0, data: null });
  }, []);

  return {
    isPending: state.isPending,
    error: state.error,
    errorCode: state.errorCode,
    attempt: state.attempt,
    data: state.data,
    execute,
    reset,
  };
}

/**
 * エラーコードからユーザー向けの示唆を生成する。
 * UI コンポーネント (CheckoutErrorPanel) が利用。
 */
export function getStripeErrorSuggestion(code: StripeErrorCode | null): string | null {
  switch (code) {
    case "network":
      return "ネットワーク接続を確認してから再試行してください。";
    case "timeout":
      return "応答に時間がかかっています。少し待ってから再試行してください。";
    case "rate_limited":
      return "短時間に試行が多すぎます。30 秒ほど待ってから再試行してください。";
    case "server_error":
      return "Stripe 側で一時的な障害が発生している可能性があります。数分後に再試行してください。";
    case "client_error":
      return "入力内容や権限に問題がある可能性があります。再試行で改善しない場合はサポートにご連絡ください。";
    case "unknown":
    case null:
      return null;
  }
}
