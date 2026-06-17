/**
 * POST /api/parts/confirmations/[token]/verify-otp — 顧客が自分の携帯で OTP を入力。
 * 電話の所持を証明する（顧客・未認証）。
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { getConfirmationContext, verifyOtp } from "@/lib/parts/confirmationService";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "OTP は数字6桁です。"),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // OTP 総当たり対策: 機微フロー preset（5 req / 300s, IP 単位）。RPC 側の試行上限と二重防御。
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;

  const { token } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiValidationError("OTP を確認してください。");

  try {
    const ctx = await getConfirmationContext(token);
    if (!ctx) return apiJson({ error: "not_found" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent");
    const result = await verifyOtp(ctx.tenantId, token, parsed.data.code, { ip, userAgent: ua });
    if (!result.ok) return apiJson({ ok: false, reason: result.reason }, { status: 400 });
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "parts/confirmations/[token]/verify-otp POST");
  }
}
