/**
 * POST /api/v1/passport/referrals/claim
 *
 * 中古車店・買取業者が「Ledra から受け取った lead_token を使って
 * 成約した」と報告するためのエンドポイント。
 *
 * Body:
 *   {
 *     lead_token:        string,    // /marketplace-info のレスポンスで取得した token
 *     sale_amount_jpy:   number,    // 売却額 (税抜・整数 JPY)
 *     partner_reference: string?    // partner 側の listing/order ID
 *   }
 *
 * Returns:
 *   {
 *     ok: true,
 *     lead_id: string,
 *     referral_fee_jpy: number,
 *     per_tenant_fee_jpy: { tenant_id: amount, … }
 *   }
 *
 * Auth: Authorization: Bearer lpk_live_xxxxxxxx (scope: passport:marketplace)
 *
 * 同一 lead は 1 回しか claim できない (二重請求防止)。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
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
import { extractBearer, hasPassportScope, resolvePassportApiKey } from "@/lib/passport/api/keys";
import { isPassportPublicEnabled } from "@/lib/passport/featureGate";
import { claimLead, isLeadTokenFormat } from "@/lib/marketplace/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  lead_token: z.string().min(20),
  sale_amount_jpy: z.number().int().min(0).max(100_000_000),
  partner_reference: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  if (!isPassportPublicEnabled()) {
    return apiNotFound("Not Found");
  }
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const raw = extractBearer(req);
  if (!raw) return apiUnauthorized("APIキーが指定されていません。");

  const admin = createServiceRoleAdmin("passport referral claim — partner-side sale report");
  const auth = await resolvePassportApiKey(admin, raw);
  if (!auth.ok) return apiUnauthorized("APIキーが無効です。");
  if (!hasPassportScope(auth.ctx, "passport:marketplace")) {
    return apiForbidden("このAPIキーには marketplace スコープがありません。");
  }

  const consumerLimited = await checkRateLimit(req, "general", `passport-consumer:${auth.ctx.consumerId}`);
  if (consumerLimited) return consumerLimited;

  let payload: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "リクエスト内容が正しくありません。");
    }
    payload = parsed.data;
  } catch {
    return apiValidationError("JSON のパースに失敗しました。");
  }

  if (!isLeadTokenFormat(payload.lead_token)) {
    return apiValidationError("lead_token の形式が不正です。");
  }

  try {
    const result = await claimLead({
      admin,
      consumerId: auth.ctx.consumerId,
      leadToken: payload.lead_token,
      saleAmountJpy: payload.sale_amount_jpy,
      partnerReference: payload.partner_reference ?? null,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return apiNotFound(result.message);
        case "not_pending":
          return apiError({ code: "conflict", message: result.message, status: 409 });
        case "expired":
          return apiError({ code: "conflict", message: result.message, status: 410 });
        case "invalid_amount":
          return apiValidationError(result.message);
        case "db_error":
          return apiInternalError(new Error(result.message), "referrals/claim");
      }
    }

    return apiOk({
      lead_id: result.leadId,
      referral_fee_jpy: result.referralFeeJpy,
      per_tenant_fee_jpy: result.perTenantFeeJpy,
    });
  } catch (e) {
    return apiInternalError(e, "v1/passport/referrals/claim");
  }
}
