/**
 * POST /api/mobile/customer-intakes
 *
 * モバイル (Bearer 認証) から事前カルテ用 intake invitation を発行する.
 * 戻り値の url / short_id を Share / QR / SMS / LINE などで顧客に渡す前提.
 *
 * Web 版 `/api/admin/customer-intakes` と同等. 認証方式のみ差し替え.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createIntakeInvitation } from "@/lib/identity/intakeServer";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  label: z.string().max(100).optional().nullable(),
  contact_email: z.string().email().max(254).optional().nullable().or(z.literal("")),
  contact_phone: z.string().max(30).optional().nullable(),
  expiry_days: z.number().int().min(1).max(30).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveMobileCaller(req);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:create")) return apiForbidden();

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body ?? {});
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
    return apiInternalError(err, "POST /api/mobile/customer-intakes");
  }
}
