/**
 * Cloudflare Stream provider.
 *
 * API docs: https://developers.cloudflare.com/stream/
 *
 * Auth: Bearer token (CLOUDFLARE_STREAM_API_TOKEN) scoped to the
 *       Stream:Edit permission on the account CLOUDFLARE_ACCOUNT_ID.
 *
 * Webhook verification:
 *   CFS posts notifications with a `Webhook-Signature` header of the form
 *   `time=<unix>,sig1=<hmac-sha256-hex>` where the signed payload is
 *   `<unix>.<rawBody>` and the secret is the per-account webhook secret
 *   (CLOUDFLARE_STREAM_WEBHOOK_SECRET).
 */

import crypto from "crypto";
import { withRetry } from "@/lib/http/withRetry";
import type {
  DirectUploadHandle,
  NormalizedWebhookEvent,
  PlaybackUrlOptions,
  Result,
  ThumbnailOptions,
  VideoAsset,
  VideoProvider,
  WebhookVerifyInput,
} from "./types";

const API_BASE = "https://api.cloudflare.com/client/v4";

interface CfsConfig {
  accountId: string;
  apiToken: string;
  webhookSecret: string;
  /** Custom playback domain if set up (e.g. videos.ledra.co.jp). */
  customerSubdomain?: string;
}

function getConfig(): Result<CfsConfig> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  const webhookSecret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET?.trim();
  if (!accountId || !apiToken) {
    return { ok: false, error: "cloudflare_stream_not_configured" };
  }
  return {
    ok: true,
    data: {
      accountId,
      apiToken,
      webhookSecret: webhookSecret ?? "",
      customerSubdomain: process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN?.trim(),
    },
  };
}

interface CfsVideoResponse {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string };
  duration?: number;
  thumbnail?: string;
  meta?: Record<string, unknown>;
  uploadURL?: string;
  scheduledDeletion?: string | null;
}

function statusFromCfs(v: CfsVideoResponse): VideoAsset["status"] {
  const state = v.status?.state ?? "";
  if (v.readyToStream || state === "ready") return "ready";
  if (state === "error") return "errored";
  return "pending";
}

function toVideoAsset(v: CfsVideoResponse): VideoAsset {
  // CFS reuses `uid` as both internal id and playback id — caller may
  // store them as the same value. Mux differs (asset_id vs playback_id).
  return {
    asset_id: v.uid,
    playback_id: v.uid,
    status: statusFromCfs(v),
    duration_sec: typeof v.duration === "number" && v.duration > 0 ? Math.round(v.duration) : undefined,
    metadata: {
      thumbnail: v.thumbnail ?? null,
      meta: v.meta ?? {},
    },
  };
}

/**
 * CFS API への fetch を withRetry で包む。
 * 5xx / 429 は throw して withRetry の retry/circuit breaker を発火させる
 * (4xx は permanent error なので retry しない / Response として返す)。
 */
async function cfsFetch(path: string, init: RequestInit, cfg: CfsConfig): Promise<Response> {
  return withRetry("cf-stream", async () => {
    const res = await fetch(`${API_BASE}/accounts/${cfg.accountId}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${cfg.apiToken}`,
      },
    });
    if (res.status >= 500 || res.status === 429) {
      const err = new Error(`cf-stream:${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res;
  });
}

export const cloudflareStreamProvider: VideoProvider = {
  name: "cloudflare",

  async createDirectUpload(args): Promise<Result<DirectUploadHandle>> {
    const cfg = getConfig();
    if (!cfg.ok) return cfg;

    // CFS direct_upload endpoint mints a one-time tus upload URL.
    const body = {
      maxDurationSeconds: args.max_duration_sec ?? 7200,
      meta: { name: args.filename ?? "lesson-video" },
    };

    const res = await cfsFetch(
      "/stream/direct_upload",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      cfg.data,
    );

    if (!res.ok) {
      return { ok: false, error: `cfs_direct_upload_${res.status}` };
    }

    const json = (await res.json()) as { result?: { uid?: string; uploadURL?: string } };
    if (!json.result?.uid || !json.result?.uploadURL) {
      return { ok: false, error: "cfs_direct_upload_invalid_response" };
    }

    return {
      ok: true,
      data: {
        upload_url: json.result.uploadURL,
        asset_id: json.result.uid,
        playback_id: json.result.uid,
        expires_in_sec: 3600, // CFS direct_upload URLs are valid for 60 min
      },
    };
  },

  async getAsset(asset_id): Promise<Result<VideoAsset>> {
    const cfg = getConfig();
    if (!cfg.ok) return cfg;

    const res = await cfsFetch(`/stream/${encodeURIComponent(asset_id)}`, { method: "GET" }, cfg.data);
    if (res.status === 404) return { ok: false, error: "not_found" };
    if (!res.ok) return { ok: false, error: `cfs_get_${res.status}` };

    const json = (await res.json()) as { result?: CfsVideoResponse };
    if (!json.result) return { ok: false, error: "cfs_get_invalid_response" };
    return { ok: true, data: toVideoAsset(json.result) };
  },

  getPlaybackUrl(playback_id, opts?: PlaybackUrlOptions): string {
    // Public HLS manifest. Signed URLs require a separate /token mint;
    // we can add `signPlayback()` later when DRM is needed.
    const subdomain = process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN?.trim();
    if (subdomain) {
      return `https://${subdomain}/${encodeURIComponent(playback_id)}/manifest/video.m3u8`;
    }
    if (opts?.signed) {
      // Caller asked for signed but we have no token endpoint configured —
      // surface this as an obviously broken URL so the bug is loud, not silent.
      return `https://customer-MISSING_SUBDOMAIN.cloudflarestream.com/${encodeURIComponent(playback_id)}/manifest/video.m3u8`;
    }
    return `https://customer-${encodeURIComponent(playback_id)}.cloudflarestream.com/${encodeURIComponent(playback_id)}/manifest/video.m3u8`;
  },

  getThumbnailUrl(playback_id, opts?: ThumbnailOptions): string {
    const params = new URLSearchParams();
    if (opts?.time_sec !== undefined) params.set("time", `${opts.time_sec}s`);
    if (opts?.width !== undefined) params.set("width", String(opts.width));
    const qs = params.toString();
    const subdomain = process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN?.trim() ?? "";
    const host = subdomain || `customer-${encodeURIComponent(playback_id)}.cloudflarestream.com`;
    return `https://${host}/${encodeURIComponent(playback_id)}/thumbnails/thumbnail.jpg${qs ? `?${qs}` : ""}`;
  },

  async deleteAsset(asset_id): Promise<Result<void>> {
    const cfg = getConfig();
    if (!cfg.ok) return cfg;

    const res = await cfsFetch(`/stream/${encodeURIComponent(asset_id)}`, { method: "DELETE" }, cfg.data);
    if (!res.ok && res.status !== 404) {
      return { ok: false, error: `cfs_delete_${res.status}` };
    }
    return { ok: true, data: undefined };
  },

  async parseWebhook(input: WebhookVerifyInput): Promise<Result<NormalizedWebhookEvent>> {
    const cfg = getConfig();
    if (!cfg.ok) return cfg;
    if (!cfg.data.webhookSecret) {
      return { ok: false, error: "cloudflare_stream_webhook_secret_missing" };
    }

    // Webhook-Signature: time=1640000000,sig1=abc123...
    const sigHeader =
      input.headers["webhook-signature"] ?? input.headers["Webhook-Signature"] ?? input.headers["WEBHOOK-SIGNATURE"];
    if (!sigHeader || typeof sigHeader !== "string") {
      return { ok: false, error: "missing_signature_header" };
    }

    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => {
        const [k, v] = p.split("=", 2);
        return [k.trim(), (v ?? "").trim()];
      }),
    );
    const time = parts.time;
    const sig = parts.sig1;
    if (!time || !sig) return { ok: false, error: "malformed_signature" };

    // Reject events older than 5 minutes to limit replay surface.
    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(time));
    if (!Number.isFinite(ageSec) || ageSec > 300) {
      return { ok: false, error: "stale_signature" };
    }

    const expected = crypto
      .createHmac("sha256", cfg.data.webhookSecret)
      .update(`${time}.${input.rawBody}`)
      .digest("hex");

    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!valid) return { ok: false, error: "invalid_signature" };

    let body: { uid?: string; readyToStream?: boolean; status?: { state?: string }; duration?: number };
    try {
      body = JSON.parse(input.rawBody);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
    if (!body.uid) return { ok: false, error: "missing_asset_id" };

    const state = body.status?.state ?? "";
    let type: NormalizedWebhookEvent["type"] = "ignored";
    if (body.readyToStream === true || state === "ready") type = "asset.ready";
    else if (state === "error") type = "asset.errored";

    return {
      ok: true,
      data: {
        type,
        asset_id: body.uid,
        duration_sec: typeof body.duration === "number" && body.duration > 0 ? Math.round(body.duration) : undefined,
        metadata: { cfs_state: state },
      },
    };
  },
};
