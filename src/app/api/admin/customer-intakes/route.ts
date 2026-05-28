/**
 * /api/admin/customer-intakes
 *
 * - GET: 招待一覧 (tenant スコープ)
 * - POST: 新規招待を発行. 戻り値に URL + raw token を含む.
 *         **raw token はこのレスポンス以外には現れない**.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasPermission } from "@/lib/auth/permissions";
import { apiForbidden } from "@/lib/api/response";
import { createIntakeInvitation } from "@/lib/identity/intakeServer";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  label: z.string().max(100).optional().nullable(),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  contact_phone: z.string().max(30).optional().nullable(),
  expiry_days: z.number().int().min(1).max(30).optional(),
});

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:view")) return apiForbidden();

  const { admin } = createTenantScopedAdmin(caller.tenantId);
  const url = req.nextUrl;
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  let query = admin
    .from("customer_intake_invitations")
    .select(
      "id, short_id, store_id, label, status, contact_email, contact_phone, created_at, expires_at, completed_at, completed_customer_id, ocr_attempts",
    )
    .eq("tenant_id", caller.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return apiInternalError(error, "GET /api/admin/customer-intakes");

  return apiOk({ invitations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "admin_write");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:create")) return apiForbidden();

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiValidationError("入力内容が不正です: " + parsed.error.issues.map((i) => i.message).join(", "));
  }
  if (parsed.data.label && containsMyNumber(parsed.data.label)) {
    return apiValidationError("ラベルに個人番号は使えません");
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const result = await createIntakeInvitation({
      tenantId: caller.tenantId,
      storeId: parsed.data.store_id ?? null,
      label: parsed.data.label ?? null,
      contactEmail: parsed.data.contact_email ?? null,
      contactPhone: parsed.data.contact_phone ?? null,
      expiryDays: parsed.data.expiry_days,
      createdBy: caller.userId,
      baseUrl,
    });
    return apiOk({
      id: result.id,
      short_id: result.shortId,
      url: result.url,
      expires_at: result.expiresAt,
    });
  } catch (err) {
    return apiInternalError(err, "POST /api/admin/customer-intakes");
  }
}
