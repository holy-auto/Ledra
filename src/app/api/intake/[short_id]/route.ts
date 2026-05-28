/**
 * GET /api/intake/:short_id?t=<rawToken>
 *
 * 公開エンドポイント. 招待トークンを検証し、フォーム表示に必要な情報を返す.
 * tenant_id 等の内部 ID は返さず、ラベルと status のみ.
 */
import { NextRequest } from "next/server";
import { apiOk, apiNotFound, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { validateIntakeToken } from "@/lib/identity/intakeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ short_id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const { short_id } = await ctx.params;
  const rawToken = req.nextUrl.searchParams.get("t");
  if (!rawToken) return apiValidationError("token (t) は必須です");

  const validated = await validateIntakeToken(short_id, rawToken);
  if (!validated) return apiNotFound("招待が見つかりません");

  return apiOk({
    label: validated.label,
    status: validated.status,
    expires_at: validated.expiresAt,
    can_ocr: validated.status === "pending" && validated.ocrAttempts < 10,
    ocr_attempts_remaining: Math.max(0, 10 - validated.ocrAttempts),
  });
}
