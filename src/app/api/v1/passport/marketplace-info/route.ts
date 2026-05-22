/**
 * GET /api/v1/passport/marketplace-info?vin=...
 *
 * 中古車店・買取業者向けの拡張 passport API。
 * /api/v1/passport/verify と同じデータ + lead_token を返す。
 * partner はこの lead_token を保持し、成約した時に
 * POST /api/v1/passport/referrals/claim で報告する。
 *
 * Auth:    Authorization: Bearer lpk_live_xxxxxxxx
 * Scope:   passport:marketplace
 *
 * 同じ partner + 同じ VIN で 7 日以内に複数照会した場合は
 * 既存 lead を再利用するため lead_token は変わらない (重複 lead 防止)。
 */
import type { NextRequest } from "next/server";
import {
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiOk,
  apiError,
  apiInternalError,
} from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { extractBearer, hasPassportScope, logPassportApiCall, resolvePassportApiKey } from "@/lib/passport/api/keys";
import { buildPassportVerifyResponse } from "@/lib/passport/api/verify";
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { getClientIp } from "@/lib/rateLimit";
import { createOrReuseLead } from "@/lib/marketplace/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "GET /api/v1/passport/marketplace-info";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const raw = extractBearer(req);
  if (!raw) return apiUnauthorized("APIキーが指定されていません。");

  const admin = createServiceRoleAdmin("marketplace-info — consumer-authenticated cross-tenant lookup + lead creation");

  const auth = await resolvePassportApiKey(admin, raw);
  if (!auth.ok) return apiUnauthorized("APIキーが無効です。");
  if (!hasPassportScope(auth.ctx, "passport:marketplace")) {
    return apiForbidden("このAPIキーには marketplace スコープがありません。");
  }

  const consumerLimited = await checkRateLimit(req, "general", `passport-consumer:${auth.ctx.consumerId}`);
  if (consumerLimited) return consumerLimited;

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
    return apiValidationError("VINの形式が不正です。");
  }

  try {
    const passport = await buildPassportVerifyResponse(vin);
    const status = passport ? 200 : 404;

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

    if (!passport) {
      return apiError({
        code: "not_found",
        message: "このVINに該当する車両パスポートは見つかりませんでした。",
        status: 404,
      });
    }

    // partner 側に紹介手数料 claim のための lead token を発行
    const lead = await createOrReuseLead({
      admin,
      consumerId: auth.ctx.consumerId,
      apiKeyId: auth.ctx.keyId,
      vinNormalized: vin,
    });

    if (!lead.ok) {
      // lead 作成失敗時もパスポート照会は返す (lead は best-effort)
      return apiOk({ ...passport, lead_token: null, attributed_shop_count: 0 });
    }

    return apiOk(
      {
        ...passport,
        lead_token: lead.leadToken,
        attributed_shop_count: lead.attributedTenantIds.length,
      },
      200,
      { cacheControl: "private, no-store, max-age=0" }, // lead_token は照会者ごとに違うので絶対キャッシュ不可
    );
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
    return apiInternalError(e, "v1/passport/marketplace-info");
  }
}
