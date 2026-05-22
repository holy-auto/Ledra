/**
 * GET /api/v1/accident-match?vin=...
 *
 * 保険会社の事故査定システム向け: VIN を渡すと、その車両を最も
 * 得意とする施工店を最大 5 件ランキングして返す。
 *
 * Phase D #8。ロジックは src/lib/accident-match/match.ts。
 *
 * Auth:    Authorization: Bearer lpk_live_xxxxxxxx
 * Scope:   accident:match
 *
 * レスポンスは PII を含まない (顧客名・連絡先・内部 ID 一切返さない)。
 * 公開してよい店舗名 / 公開 slug / 集計値のみ。
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
import { normalizeVin } from "@/lib/passport/normalizeVin";
import { matchShopsForAccident } from "@/lib/accident-match/match";
import { getClientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENDPOINT = "GET /api/v1/accident-match";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const raw = extractBearer(req);
  if (!raw) return apiUnauthorized("APIキーが指定されていません。");

  const admin = createServiceRoleAdmin("accident-match — insurer consumer cross-tenant aggregation");
  const auth = await resolvePassportApiKey(admin, raw);
  if (!auth.ok) return apiUnauthorized("APIキーが無効です。");
  if (!hasPassportScope(auth.ctx, "accident:match")) {
    return apiForbidden("このAPIキーには accident:match スコープがありません。");
  }

  const consumerLimited = await checkRateLimit(req, "general", `passport-consumer:${auth.ctx.consumerId}`);
  if (consumerLimited) return consumerLimited;

  const url = new URL(req.url);
  const vinRaw = (url.searchParams.get("vin") ?? "").trim();
  if (!vinRaw) {
    return apiValidationError("vin パラメータは必須です。");
  }
  const vin = normalizeVin(vinRaw);
  if (vin.length < 8) {
    return apiValidationError("VINの形式が不正です。");
  }

  try {
    const result = await matchShopsForAccident(admin, vin);
    const status = result ? 200 : 404;

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

    if (!result) {
      return apiError({
        code: "not_found",
        message: "このVINに該当する施工履歴が見つかりませんでした。",
        status: 404,
      });
    }

    return apiOk(result, 200, { cacheControl: "public, max-age=60" });
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
    return apiInternalError(e, "v1/accident-match");
  }
}
