import { after } from "next/server";

/**
 * Next.js の `after()` にレスポンス送出後の後処理を委譲する。ただし
 * リクエストスコープ外（ユニットテスト等、`after` was called outside a
 * request scope）では `after()` が **同期的に throw** するため、その場合は
 * 即時実行にフォールバックし、呼び出し側のハンドラが 500 を返さないようにする。
 *
 * `fn` は fire-and-forget（自身で例外を握りつぶす best-effort 処理）を前提とする。
 * 本番の実リクエストでは `after()` が使えるため、フォールバックは走らない。
 */
export function afterOrInline(fn: () => Promise<unknown>): void {
  try {
    after(fn);
  } catch {
    // ponytail: リクエストスコープ外では応答後スケジューリングができないため即時実行。
    // 実リクエストでは到達しない（テスト等の非リクエスト文脈のみ）。
    void fn();
  }
}
