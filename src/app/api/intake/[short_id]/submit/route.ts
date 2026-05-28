/**
 * POST /api/intake/:short_id/submit?t=<rawToken>
 *
 * 公開フォーム送信. 招待 → customers 作成 → 招待を completed に.
 * 個人番号 (12 桁) は CHECK 制約 + 入力フィルタで除外する.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";
import { validateIntakeToken, submitAndProcessIntake } from "@/lib/identity/intakeServer";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SubmitSchema = z.object({
  name: z.string().min(1).max(100),
  name_kana: z.string().max(100).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  postal_code: z.string().max(10).optional(),
  address: z.string().max(300).optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(1000).optional(),
});

function dropMyNumber<T extends Record<string, unknown>>(input: T): T | null {
  // 全文字列フィールドに 12 桁数字が混入していないか確認.
  // ヒットしたら null (reject) を返す.
  for (const v of Object.values(input)) {
    if (typeof v === "string" && containsMyNumber(v)) return null;
  }
  return input;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ short_id: string }> }) {
  const limited = await checkRateLimit(req, "auth"); // 10/60s
  if (limited) return limited;

  const { short_id } = await ctx.params;
  const rawToken = req.nextUrl.searchParams.get("t");
  if (!rawToken) return apiValidationError("token (t) は必須です");

  const intake = await validateIntakeToken(short_id, rawToken);
  if (!intake) return apiNotFound("招待が見つかりません");
  if (intake.status !== "pending") {
    return apiError({
      code: "forbidden",
      status: 403,
      message:
        intake.status === "completed"
          ? "この招待はすでに送信されています"
          : intake.status === "expired"
            ? "この招待は期限切れです"
            : "この招待は無効化されています",
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError("入力内容が不正です: " + parsed.error.issues.map((i) => i.message).join(", "));
  }

  const safe = dropMyNumber(parsed.data);
  if (!safe) {
    logger.warn("intake_submit_mynumber_detected", { intakeId: intake.id });
    return apiError({
      code: "validation_error",
      status: 400,
      message: "マイナンバー (12 桁の個人番号) は当サービスでは取り扱えません。該当箇所を削除して再送信してください。",
    });
  }

  try {
    const result = await submitAndProcessIntake({
      intakeId: intake.id,
      tenantId: intake.tenantId,
      name: safe.name,
      nameKana: safe.name_kana ?? null,
      email: safe.email && safe.email.length > 0 ? safe.email : null,
      phone: safe.phone ?? null,
      postalCode: safe.postal_code ?? null,
      address: safe.address ?? null,
      birthDate: safe.birth_date ?? null,
      note: safe.note ?? null,
    });

    logger.info("intake_submit_complete", {
      intakeId: intake.id,
      tenantId: intake.tenantId,
      auto_status: result.status,
      merged: result.merged ?? false,
      issue_count: result.issues?.length ?? 0,
    });

    // 自動承認された場合は customers 作成済み. needs_review なら店舗で確認待ち.
    return apiOk({ status: result.status });
  } catch (err) {
    return apiInternalError(err, "POST /api/intake/:short_id/submit");
  }
}
