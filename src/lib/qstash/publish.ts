import { Client } from "@upstash/qstash";

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
  options?: { retries?: number; deduplicationId?: string },
) {
  const client = getClient();
  if (!client) return null;

  const targetUrl = `${getBaseUrl()}${path}`;
  console.info("[QSTASH][publish]", path, { hasToken: true });

  const result = await client.publishJSON({
    url: targetUrl,
    body: payload,
    ...(options?.retries !== undefined && { retries: options.retries }),
    ...(options?.deduplicationId !== undefined && {
      deduplicationId: options.deduplicationId,
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
    ...(typeof key === "string" && key && { deduplicationId: `case-created:${key}` }),
  });
}

/** Enqueue polygon backfill job for async processing */
export async function enqueuePolygonBackfill(payload: { job_id: string; tenant_id: string }) {
  return publish("/api/qstash/polygon-backfill", payload, {
    retries: 2,
    deduplicationId: `polygon-backfill:init:${payload.job_id}`,
  });
}

/** Enqueue batch PDF generation job for async processing */
export async function enqueueBatchPdf(payload: { job_id: string; tenant_id: string; public_ids: string[] }) {
  return publish("/api/qstash/batch-pdf", payload, {
    retries: 2,
    deduplicationId: `batch-pdf:${payload.job_id}`,
  });
}

/** Enqueue Square order sync job for async processing */
export async function enqueueSquareSync(payload: { job_id: string; tenant_id: string }) {
  return publish("/api/qstash/square-sync", payload, {
    retries: 2,
    deduplicationId: `square-sync:init:${payload.job_id}`,
  });
}
