/**
 * C-L5 是正 (2026-09-08): Sentry の Next.js SDK は HTTP integration で
 * `event.request.headers` にリクエストヘッダをそのまま含めうる。
 * `authorization`（Bearer トークン・APIキー）と `cookie`（セッション）は
 * それ自体が認証情報そのもので、Sentry へ送ると第三者（Sentry へのアクセス
 * 権限を持つ者）がそのままセッションを乗っ取れてしまう。サーバー/エッジ両方の
 * `beforeSend` から呼ぶ共通のスクラブ処理をここに1本化する。
 *
 * 大文字小文字を問わず消す（ヘッダ名は case-insensitive）。
 *
 * ponytail: Sentry の Event 型を直接 import すると SDK バージョンごとに
 * export 経路が変わりやすいので、ここでは必要な形だけを緩く受ける。
 * 呼び出し側 (sentry.server.config.ts / sentry.edge.config.ts) は
 * beforeSend の event をそのまま渡せる。
 */
const SENSITIVE_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);

export function scrubSentryRequestHeaders<T extends { request?: { headers?: Record<string, unknown> | null } }>(
  event: T,
): T {
  const headers = event.request?.headers;
  if (!headers || typeof headers !== "object") return event;

  for (const key of Object.keys(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      delete headers[key];
    }
  }
  return event;
}
