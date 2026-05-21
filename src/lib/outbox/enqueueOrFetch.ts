/**
 * オンライン: 通常の fetch を実行して結果を返す
 * オフライン: outbox に enqueue して「保留扱い」のレスポンスを返す
 *
 * 呼び出し側 (JobStatusPanel など) は通常の fetch と同じ形で使えるよう、
 * Response 互換オブジェクト + queued フラグを返す。queued=true の場合は
 * UI で "保留中・ネット復帰後に同期します" 等のメッセージを出すと親切。
 *
 * 注: GET には使わない (POST/PUT/PATCH/DELETE 専用)。GET は読み取りで
 * 並び替えなどローカルキャッシュとは性質が違うため別途扱う。
 */

import { enqueueOutbox } from "./queue";
import { registerOutboxBackgroundSync } from "./backgroundSync";
import type { OutboxMethod, OutboxKind } from "./types";

export interface OfflineCapableResult {
  ok: boolean;
  status: number;
  queued: boolean;
  /** queued=true のときの outbox id (UI の取消用) */
  outboxId?: string;
  /** queued=false のときの実レスポンス */
  response?: Response;
  /** fetch がネットワークエラーで失敗した時の生メッセージ (UI の通知用) */
  networkError?: string;
}

interface Options {
  url: string;
  method: OutboxMethod;
  body?: unknown;
  headers?: Record<string, string>;
  label: string;
  kind: OutboxKind;
  /**
   * Stripe 風 idempotency-key。online/offline 両経路で `Idempotency-Key`
   * ヘッダに乗せて送る。重複送信 (再試行) でも 1 回だけ実行されることを
   * サーバ側 (`withIdempotency`) が保証する。
   */
  idempotencyKey?: string;
  /** デフォルト navigator.onLine */
  isOnline?: () => boolean;
}

/** Options から効果的なヘッダを作る (idempotency-key + Content-Type)。 */
function effectiveHeaders(opts: Options, withContentType: boolean): Record<string, string> {
  return {
    ...(withContentType ? { "Content-Type": "application/json" } : {}),
    ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    ...(opts.headers ?? {}),
  };
}

export async function enqueueOrFetch(opts: Options): Promise<OfflineCapableResult> {
  const isOnline = opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const bodyJson = opts.body == null ? null : JSON.stringify(opts.body);

  // outbox に保存する headers にも idempotency-key を含める (drainOutbox で再送時に効く)
  const persistedHeaders = opts.idempotencyKey
    ? { ...(opts.headers ?? {}), "Idempotency-Key": opts.idempotencyKey }
    : opts.headers;

  if (isOnline()) {
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: effectiveHeaders(opts, bodyJson != null),
        body: bodyJson ?? undefined,
        credentials: "include",
      });
      return { ok: res.ok, status: res.status, queued: false, response: res };
    } catch (e) {
      // ネットワークエラー (CORS 以外) は実質オフラインに近いので outbox に流す
      // 直前 isOnline() が true でも、fetch 実行中に切断されることがある
      const item = await enqueueOutbox({
        url: opts.url,
        method: opts.method,
        bodyJson,
        headers: persistedHeaders,
        label: opts.label,
        kind: opts.kind,
      });
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        status: 0,
        queued: true,
        outboxId: item?.id,
        networkError: msg,
      };
    }
  }

  // オフライン: outbox 投入
  const item = await enqueueOutbox({
    url: opts.url,
    method: opts.method,
    bodyJson,
    headers: persistedHeaders,
    label: opts.label,
    kind: opts.kind,
  });
  // Background Sync を登録 (対応ブラウザのみ。失敗しても呼び出し元は気にしない)
  void registerOutboxBackgroundSync();
  return { ok: true, status: 202, queued: true, outboxId: item?.id };
}
