/**
 * POST /api/admin/customer-intakes/:id/approve
 *
 * 店舗 (tenant 管理者) が submitted 状態の intake を確認し、customers として
 * 正規登録する. 既存顧客にマージしたい場合は merge_into_customer_id を渡す.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { approveIntake } from "@/lib/identity/intakeServer";
import { containsMyNumber } from "@/lib/identity/ocrFilter";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OverridesSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    name_kana: z.string().max(100).optional().nullable(),
    email: z.string().email().max(254).optional().nullable().or(z.literal("")),
    phone: z.string().max(40).optional().nullable(),
    postal_code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    note: z.string().max(2000).optional().nullable(),
  })
  .optional();

const Schema = z.object({
  overrides: OverridesSchema,
  merge_into_customer_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:create")) return apiForbidden();

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiValidationError("入力内容が不正です: " + parsed.error.issues.map((i) => i.message).join(", "));
  }

  const overrides = parsed.data.overrides;
  if (overrides) {
    for (const v of Object.values(overrides)) {
      if (typeof v === "string" && containsMyNumber(v)) {
        return apiValidationError("マイナンバー (12 桁の個人番号) は当サービスでは取り扱えません");
      }
    }
  }

  try {
    const result = await approveIntake({
      intakeId: id,
      tenantId: caller.tenantId,
      approvedBy: caller.userId,
      overrides: overrides
        ? {
            name: overrides.name,
            name_kana: overrides.name_kana ?? undefined,
            email: overrides.email && overrides.email.length > 0 ? overrides.email : null,
            phone: overrides.phone ?? undefined,
            postal_code: overrides.postal_code ?? undefined,
            address: overrides.address ?? undefined,
            birth_date: overrides.birth_date ?? undefined,
            note: overrides.note ?? undefined,
          }
        : undefined,
      mergeIntoCustomerId: parsed.data.merge_into_customer_id ?? undefined,
    });

    logger.info("intake_approved", {
      intakeId: id,
      tenantId: caller.tenantId,
      customerId: result.customerId,
      merged: result.merged,
      approvedBy: caller.userId,
    });

    return apiOk({ customer_id: result.customerId, merged: result.merged });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("status must be 'submitted'")) {
      return apiValidationError("この招待は確認待ちの状態ではありません");
    }
    if (msg.includes("intake not found")) {
      return apiValidationError("招待が見つかりません");
    }
    return apiInternalError(err, "POST /api/admin/customer-intakes/:id/approve");
  }
}
