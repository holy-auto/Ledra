/**
 * POST /api/passport/transfers/initiate
 *
 * Tenant member initiates an ownership transfer for one of their
 * vehicles. The new owner receives an email with a tokenized
 * accept/reject link.
 *
 * Body: { vehicle_id, to_email, to_name?, message?, ttl_days? }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiValidationError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasMinRole } from "@/lib/auth/roles";
import { initiatePassportTransfer } from "@/lib/passport/transfers/initiate";

export const dynamic = "force-dynamic";

const schema = z.object({
  vehicle_id: z.string().uuid("車両IDの形式が不正です。"),
  to_email: z.string().email("メールアドレスの形式が不正です。"),
  to_name: z.string().max(120).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  ttl_days: z.number().int().min(1).max(30).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Manager/admin only — staff can issue certs but ownership
    // transfer is a higher-trust action (affects a customer
    // relationship spanning the platform).
    if (!hasMinRole(caller.role, "admin")) {
      return apiForbidden("この操作には管理者権限が必要です。");
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "リクエスト内容が正しくありません。");
    }
    const body = parsed.data;

    const res = await initiatePassportTransfer({
      tenantId: caller.tenantId,
      vehicleId: body.vehicle_id,
      userId: caller.userId,
      toEmail: body.to_email,
      toName: body.to_name ?? null,
      message: body.message ?? null,
      ttlDays: body.ttl_days,
    });

    if (!res.ok) {
      switch (res.reason) {
        case "vehicle_not_found":
          return apiNotFound(res.message);
        case "vehicle_no_vin":
        case "vehicle_opted_out":
        case "passport_not_found":
        case "to_email_invalid":
        case "to_email_same_as_current":
          return apiValidationError(res.message);
        case "pending_transfer_exists":
          return apiError({ code: "conflict", message: res.message, status: 409 });
        case "db_error":
          return apiInternalError(new Error(res.message), "passport/transfers/initiate");
      }
    }

    return apiOk({ transfer_id: res.transferId, expires_at: res.expiresAt });
  } catch (e) {
    return apiInternalError(e, "passport/transfers/initiate");
  }
}
