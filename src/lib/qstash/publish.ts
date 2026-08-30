import { Client } from "@upstash/qstash";
import { createHash } from "node:crypto";

const DEDUP_MAX_LENGTH = 100;

/**
 * QStash の deduplicationId は英数字・'_'・'-' 以外を受け付けない
 * （':' を含むと "DeduplicationId cannot contain ':'" で publish が失敗する）。
 * 予約文字を '-' に置換し、長すぎるキーは可読プレフィックス + sha256 短縮ダイジェスト
 * で一意性を保ったまま切り詰める。
 */
export function sanitizeDeduplicationId(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (sanitized.length <= DEDUP_MAX_LENGTH) return sanitized;
  // ダイジェストは元文字列から取る（置換で潰れた差分でも一意性が残るように）
  const digest = createHash("sha256").update(id).digest("hex").slice(0, 16);
  return `${sanitized.slice(0, DEDUP_MAX_LENGTH - digest.length - 1)}-${digest}`;
}

function getClient() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.warn("[QSTASH] QSTASH_TOKEN not set, skipping publish");
    return null;
  }
  return new Client({ token });
}

function getBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean) as string[];

  const baseUrl = candidates[0];

  if (!baseUrl) {
    throw new Error("Base URL is not set. Set NEXT_PUBLIC_APP_URL or APP_URL in Vercel.");
  }

  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

async function publish(
  path: string,
  payload: Record<string, unknown>,
  options?: { retries?: number; deduplicationId?: string; delay?: number },
) {
  const client = getClient();
  if (!client) return null;

  const targetUrl = `${getBaseUrl()}${path}`;
  console.info("[QSTASH][publish]", path, { hasToken: true });

  const result = await client.publishJSON({
    url: targetUrl,
    body: payload,
    ...(options?.retries !== undefined && { retries: options.retries }),
    ...(options?.delay !== undefined && { delay: options.delay }),
    ...(options?.deduplicationId !== undefined && {
      deduplicationId: sanitizeDeduplicationId(options.deduplicationId),
    }),
  });

  return result;
}

/** Enqueue certificate creation event for async processing */
export async function enqueueInsuranceCaseCreated(payload: {
  certificate_id?: string | null;
  public_id?: string;
  [k: string]: unknown;
}) {
  // public_id (or certificate_id) ごとに 1 通しかディスパッチしない。
  // ネットワーク再試行で多重 enqueue されても QStash 側で deduplication。
  const key = payload.public_id ?? payload.certificate_id ?? undefined;
  return publish("/api/qstash/insurance-case-created", payload, {
    ...(typeof key === "string" && key && { deduplicationId: `case-created-${key}` }),
  });
}

/** Enqueue polygon backfill job for async processing */
export async function enqueuePolygonBackfill(payload: { job_id: string; tenant_id: string }) {
  return publish("/api/qstash/polygon-backfill", payload, {
    retries: 2,
    deduplicationId: `polygon-backfill-init-${payload.job_id}`,
  });
}

/** Enqueue the next polygon backfill batch (QStash route の自己再キューイング用) */
export async function enqueuePolygonBackfillNextBatch(payload: {
  job_id: string;
  tenant_id: string;
  total_processed: number;
}) {
  const { total_processed, ...body } = payload;
  return publish("/api/qstash/polygon-backfill", body, {
    retries: 2,
    delay: 5,
    // 同じ累積処理件数での再キュー要求はネットワーク再試行とみなして deduplication。
    // 進捗が進めばキーが変わるので次バッチは正しく enqueue される。
    deduplicationId: `polygon-backfill-${payload.job_id}-${total_processed}`,
  });
}

/** Enqueue batch PDF generation job for async processing */
export async function enqueueBatchPdf(payload: { job_id: string; tenant_id: string; public_ids: string[] }) {
  return publish("/api/qstash/batch-pdf", payload, {
    retries: 2,
    deduplicationId: `batch-pdf-${payload.job_id}`,
  });
}

/** Enqueue Square order sync job for async processing */
export async function enqueueSquareSync(payload: { job_id: string; tenant_id: string }) {
  return publish("/api/qstash/square-sync", payload, {
    retries: 2,
    deduplicationId: `square-sync-init-${payload.job_id}`,
  });
}

/** Enqueue the next Square sync page (QStash route の自己再キューイング用) */
export async function enqueueSquareSyncNextPage(payload: {
  job_id: string;
  tenant_id: string;
  cursor: string;
  page: number;
}) {
  return publish("/api/qstash/square-sync", payload, {
    retries: 2,
    // 2秒後に実行（Square レートリミット対策）
    delay: 2,
    // Square の cursor は不透明で長大なのでキーには使わず、(job_id, page) で deduplication。
    // 同一ページの再キュー要求はネットワーク再試行扱いで弾かれ、次ページはキーが変わる。
    deduplicationId: `square-sync-${payload.job_id}-page-${payload.page}`,
  });
}

/**
 * Enqueue LINE message-history reservation extraction for a newly linked customer.
 *
 * 顧客に line_user_id が紐づいた直後に呼ぶ。過去の inbound LINE メッセージを
 * AI 解析して予約候補 (customer_messages.ai_extracted) を埋める。
 * 顧客単位で deduplicate するので、複数経路から多重 enqueue されても 1 度だけ走る。
 */
export async function enqueueLineHistoryImport(payload: {
  tenant_id: string;
  customer_id: string;
  line_user_id: string;
}) {
  return publish("/api/qstash/line-history-import", payload, {
    retries: 2,
    deduplicationId: `line-history-import-${payload.customer_id}`,
  });
}

/** Fan out one Google Calendar tenant sync so the cron request is not the worker. */
export async function enqueueGcalTenantSync(payload: { tenant_id: string; from: string; to: string }) {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return publish("/api/qstash/gcal-tenant-sync", payload, {
    retries: 2,
    deduplicationId: `gcal-sync-${payload.tenant_id}-${bucket}`,
  });
}

/** Fan out one accounting integration sync with provider-level retry isolation. */
export async function enqueueAccountingTenantSync(payload: { tenant_id: string; provider: string }) {
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
  return publish("/api/qstash/accounting-tenant-sync", payload, {
    retries: 2,
    deduplicationId: `accounting-sync-${payload.tenant_id}-${payload.provider}-${bucket}`,
  });
}
