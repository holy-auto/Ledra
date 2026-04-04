import { NextResponse } from "next/server";

/**
 * 統一エラーレスポンスヘルパー
 *
 * - 本番環境では内部エラーの詳細をクライアントに漏らさない
 * - 一貫したレスポンス形式を保証
 * - apiInternalError は自動的に Sentry にエラーを送信
 */

/** Lazily capture errors to Sentry without blocking the response */
function captureSentryError(error: unknown) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(error);
    })
    .catch(() => {});
}

type ErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "rate_limit_unavailable"
  | "billing_required"
  | "plan_limit"
  | "db_error"
  | "auth_error"
  | "internal_error";

interface ApiErrorOptions {
  /** クライアントに表示するメッセージ */
  message: string;
  /** HTTPステータスコード */
  status: number;
  /** エラーコード（機械的な識別用） */
  code: ErrorCode;
  /** 追加データ（制限値など） */
  data?: Record<string, unknown>;
}

const isProd = process.env.NODE_ENV === "production";

/** 統一エラーレスポンス */
export function apiError(opts: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: opts.code,
      message: opts.message,
      ...(opts.data ?? {}),
    },
    { status: opts.status },
  );
}

/** 統一成功レスポンス */
export function apiOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/** 内部エラーを安全にハンドリング（本番ではメッセージを隠す） */
export function apiInternalError(error: unknown, context?: string) {
  const msg = error instanceof Error ? error.message : String(error);
  if (context) {
    console.error(`[API Error] ${context}:`, msg);
  } else {
    console.error("[API Error]", msg);
  }

  captureSentryError(error);

  return apiError({
    code: "internal_error",
    message: isProd ? "サーバーエラーが発生しました。" : `内部エラー: ${msg}`,
    status: 500,
  });
}

/** 認証エラー */
export function apiUnauthorized(message = "認証が必要です。") {
  return apiError({ code: "unauthorized", message, status: 401 });
}

/** 権限エラー */
export function apiForbidden(message = "この操作を行う権限がありません。") {
  return apiError({ code: "forbidden", message, status: 403 });
}

/** バリデーションエラー */
export function apiValidationError(message: string, data?: Record<string, unknown>) {
  return apiError({ code: "validation_error", message, status: 400, data });
}

/** Not Found */
export function apiNotFound(message = "リソースが見つかりません。") {
  return apiError({ code: "not_found", message, status: 404 });
}

/** プラン制限エラー */
export function apiPlanLimit(message: string, data?: Record<string, unknown>) {
  return apiError({ code: "plan_limit", message, status: 403, data });
}

/** Sanitize error messages for production - strip Supabase internals */
export function sanitizeErrorMessage(error: unknown, fallback = "処理中にエラーが発生しました。"): string {
  if (process.env.NODE_ENV === "development") {
    return error instanceof Error ? error.message : String(error);
  }
  return fallback;
}
