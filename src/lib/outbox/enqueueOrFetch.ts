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
  /** デフォルト navigator.onLine */
  isOnline?: () => boolean;
}

export async function enqueueOrFetch(opts: Options): Promise<OfflineCapableResult> {
  const isOnline = opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const bodyJson = opts.body == null ? null : JSON.stringify(opts.body);

  if (isOnline()) {
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: { ...(bodyJson ? { "Content-Type": "application/json" } : {}), ...(opts.headers ?? {}) },
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
        headers: opts.headers,
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
    headers: opts.headers,
    label: opts.label,
    kind: opts.kind,
  });
  return { ok: true, status: 202, queued: true, outboxId: item?.id };
}
