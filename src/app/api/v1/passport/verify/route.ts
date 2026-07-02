/**
 * GET /api/v1/passport/verify?vin=...
 *
 * Public, API-key authenticated passport verification.
 *
 * Auth:    Authorization: Bearer lpk_live_xxxxxxxx
 * Scope:   passport:verify
 * Returns: sanitized passport summary (no PII)
 *
 * Errors:
 *   401 unauthorized          — missing / invalid / revoked key
 *   403 forbidden             — key lacks passport:verify scope
 *   404 not_found             — VIN has no passport (no anchored certs)
 *   422 validation_error      — VIN format invalid
 *   429 rate_limited          — per-consumer rate limit exceeded
 */
import type { NextRequest } from "next/server";
import {
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiOk,
  apiError,
  apiInternalError,
  apiNotFound,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  checkPassportMonthlyQuota,
  extractBearer,
  hasPassportScope,
  logPassportApiCall,
  resolvePassportApiKey,
} from "@/lib/passport/api/keys";
import { buildPassportVerifyResponse } from "@/lib/passport/api/verify";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "GET /api/v1/passport/verify";

export async function GET(req: NextRequest) {
  if (!isPassportPublicEnabled()) {
    return apiNotFound("Not Found");
  }
  const startedAt = Date.now();

  // Coarse IP-based limiter as first line of defense. The
  // per-consumer limiter runs below once the key is resolved.
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const raw = extractBearer(req);
  if (!raw) {
    return apiUnauthorized("APIキーが指定されていません。");
  }

  const admin = createServiceRoleAdmin(
    "public passport verify API — anonymous (consumer-authenticated) cross-tenant read",
  );

  const auth = await resolvePassportApiKey(admin, raw);
  if (!auth.ok) {
    return apiUnauthorized("APIキーが無効です。");
  }
  if (!hasPassportScope(auth.ctx, "passport:verify")) {
    return apiForbidden("このAPIキーには検証スコープがありません。");
  }

  // Per-consumer rate limit (in addition to IP-based above). We
  // keep the IP limiter for unauthenticated abuse traffic; the
  // consumer limiter is for billing-side abuse.
  const consumerLimited = await checkRateLimit(
    req,
    "general",
    `passport-consumer:${auth.ctx.consumerId}`,
    auth.ctx.rateLimitPerMinute,
  );
  if (consumerLimited) return consumerLimited;

  // Monthly quota: 429 once we've passed monthly_quota for the current
  // UTC month. Quota of 0 = unlimited (operator opt-out per consumer).
  const quota = await checkPassportMonthlyQuota(admin, auth.ctx.consumerId, auth.ctx.monthlyQuota);
  if (!quota.allowed) {
    void logPassportApiCall({
      admin,
      apiKeyId: auth.ctx.keyId,
      consumerId: auth.ctx.consumerId,
      endpoint: ENDPOINT,
      vinQueried: null,
      responseStatus: 429,
      responseTimeMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiError({
      code: "plan_limit",
      message: "今月のリクエスト上限に達しました。来月までお待ちいただくか、上限の引き上げをご相談ください。",
      status: 429,
      data: { used: quota.used, limit: quota.limit },
    });
  }

  const url = new URL(req.url);
  const vinRaw = (url.searchParams.get("vin") ?? "").trim();
  if (!vinRaw) {
    void logPassportApiCall({
      admin,
      apiKeyId: auth.ctx.keyId,
      consumerId: auth.ctx.consumerId,
      endpoint: ENDPOINT,
      vinQueried: null,
      responseStatus: 400,
      responseTimeMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiValidationError("vin パラメータは必須です。");
  }
  const vin = normalizeVin(vinRaw);
  if (vin.length < 8) {
    void logPassportApiCall({
      admin,
      apiKeyId: auth.ctx.keyId,
      consumerId: auth.ctx.consumerId,
      endpoint: ENDPOINT,
      vinQueried: null,
      responseStatus: 400,
      responseTimeMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiValidationError("VINの形式が不正です。");
  }

  try {
    const data = await buildPassportVerifyResponse(vin);
    const status = data ? 200 : 404;

    void logPassportApiCall({
      admin,
      apiKeyId: auth.ctx.keyId,
      consumerId: auth.ctx.consumerId,
      endpoint: ENDPOINT,
      vinQueried: vin,
      responseStatus: status,
      responseTimeMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    if (!data) {
      // Return 200 + empty result form, *or* 404? We pick 404 so
      // automated callers can branch cleanly. The body never
      // reveals whether the VIN exists in our system at all
      // beyond presence/absence.
      return apiError({
        code: "not_found",
        message: "このVINに該当する車両パスポートは見つかりませんでした。",
        status: 404,
      });
    }

    return apiOk(data, 200, { cacheControl: "public, max-age=60" });
  } catch (e) {
    void logPassportApiCall({
      admin,
      apiKeyId: auth.ctx.keyId,
      consumerId: auth.ctx.consumerId,
      endpoint: ENDPOINT,
      vinQueried: vin,
      responseStatus: 500,
      responseTimeMs: Date.now() - startedAt,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return apiInternalError(e, "v1/passport/verify");
  }
}
