import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { confirmEmailOtp } from "@/lib/auth/emailOtp";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "6桁の数字を入力してください。"),
});

const REASON_MESSAGES: Record<string, string> = {
  not_found: "有効なコードがありません。再送信してください。",
  expired: "コードの有効期限が切れました。再送信してください。",
  max_attempts: "試行回数の上限に達しました。再送信してください。",
  mismatch: "コードが正しくありません。",
};

/**
 * POST /api/mobile/auth/otp/verify
 *
 * `/api/mobile/auth/otp/request` が発行したコードを照合する
 * （`src/lib/auth/emailOtp.ts` 経由で `email_otp_codes` を参照）。
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    // request 側とは別バケット（理由は otp/request/route.ts のコメント参照）。
    const limited = await checkRateLimit(request, "sensitive", `otp-verify:${caller.userId}`);
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const admin = createServiceRoleAdmin("mobile:auth-otp-verify — signup email verification");
    const result = await confirmEmailOtp(admin, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      purpose: "mobile_signup",
      code: parsed.data.code,
    });

    if (!result.ok) {
      return apiValidationError(REASON_MESSAGES[result.reason] ?? "認証に失敗しました。");
    }

    return apiOk({ verified: true });
  } catch (e) {
    return apiInternalError(e, "mobile.auth.otp.verify");
  }
}
