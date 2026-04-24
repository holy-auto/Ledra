import { NextResponse } from "next/server";

/**
 * 統一エラーレスポンスヘルパー
 *
 * - 本番環境では内部エラーの詳細をクライアントに漏らさない
 * - 一貫したレスポンス形式を保証
 * - apiInternalError は自動的に Sentry にエラーを送信
 * - 既定で `Cache-Control: private, no-store, max-age=0` + `Vary: Cookie`
 *   を付与 (共有 proxy / CDN / browser で認証済みレスポンスが別ユーザに
 *   漏れるのを防止)。Cache-Control を明示したい場合は `cacheControl` を
 *   option 経由で上書きする。
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
  /**
   * Cache-Control header. 既定値 "private, no-store, max-age=0"。
   * キャッシュ対象にしたい場合のみ override する。
   */
  cacheControl?: string;
  /** 追加 header (merge される) */
  headers?: Record<string, string>;
}

const isProd = process.env.NODE_ENV === "production";

/**
 * Default response security headers. API 応答は既定で:
 * - 共有 proxy / CDN に載せない (private, no-store)
 * - HTTP/1.0 古い proxy / browser 向けフォールバック (Pragma: no-cache)
 * - cookie 変化で cache key 分離 (Vary: Cookie) — 万一どこかでキャッシュ
 *   される場合でも別ユーザの応答を返さない
 * - 検索エンジンが誤って index しない (X-Robots-Tag: noindex, nofollow) —
 *   API URL が何らかの事故で公開された場合でも SERP 露出を防ぐ
 */
const DEFAULT_API_SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

function buildSecurityHeaders(overrides?: {
  cacheControl?: string;
  headers?: Record<string, string>;
}): Record<string, string> {
  return {
    ...DEFAULT_API_SECURITY_HEADERS,
    ...(overrides?.cacheControl ? { "cache-control": overrides.cacheControl } : {}),
    ...(overrides?.headers ?? {}),
  };
}

/** 統一エラーレスポンス */
export function apiError(opts: ApiErrorOptions) {
  return NextResponse.json(
    {
      error: opts.code,
      message: opts.message,
      ...(opts.data ?? {}),
    },
    {
      status: opts.status,
      headers: buildSecurityHeaders({ cacheControl: opts.cacheControl, headers: opts.headers }),
    },
  );
}

/** 統一成功レスポンス */
export function apiOk<T extends Record<string, unknown>>(
  data: T,
  status = 200,
  opts?: { cacheControl?: string; headers?: Record<string, string> },
) {
  return NextResponse.json({ ok: true, ...data }, { status, headers: buildSecurityHeaders(opts) });
}

/**
 * 生の JSON レスポンス (apiOk のような `{ ok: true, ... }` ラップなし)。
 *
 * apiOk の shape に合わない既存 API (例: 配列レスポンス、ダッシュ
 * ボード用の aggregated data など) で同じ security headers を付けるための
 * ヘルパー。新規コードは可能なら apiOk を使うこと。
 */
export function apiJson(
  body: unknown,
  opts?: { status?: number; cacheControl?: string; headers?: Record<string, string> },
) {
  return NextResponse.json(body, {
    status: opts?.status ?? 200,
    headers: buildSecurityHeaders({ cacheControl: opts?.cacheControl, headers: opts?.headers }),
  });
}

/**
 * 既存の NextResponse インスタンス (例: cookie 設定のために直接 new した
 * logout レスポンス) に default security headers を適用する。
 *
 * 呼び出し側で Cache-Control を既に設定していても上書きしない。
 */
export function applySecurityHeaders(
  response: NextResponse,
  opts?: { cacheControl?: string; headers?: Record<string, string> },
): NextResponse {
  const secHeaders = buildSecurityHeaders(opts);
  for (const [key, value] of Object.entries(secHeaders)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

/** 内部エラーを安全にハンドリング（本番ではメッセージを隠す） */
export function apiInternalError(error: unknown, context?: string) {
  // Handle Supabase PostgrestError (has .message but is not instanceof Error)
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
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
