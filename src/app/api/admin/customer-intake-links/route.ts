/**
 * /api/admin/customer-intake-links
 *
 * 店舗用 顧客登録リンク (繰り返し使える固定 URL/QR) の管理.
 * - GET: 一覧 (tenant スコープ)
 * - POST: 新規発行. 戻り値に URL + raw token を含む (**raw token はこのレスポンス以外には現れない**).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hasPermission } from "@/lib/auth/permissions";
import { createStoreLink, listStoreLinks } from "@/lib/identity/intakeLinkServer";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  label: z.string().max(100).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!hasPermission(caller.role, "customers:view")) return apiForbidden();

  try {
    const links = await listStoreLinks(caller.tenantId);
    return apiOk({ links });
  } catch (err) {
    return apiInternalError(err, "GET /api/admin/customer-intake-links");
  }
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
    const result = await createStoreLink({
      tenantId: caller.tenantId,
      storeId: parsed.data.store_id ?? null,
      label: parsed.data.label ?? null,
      createdBy: caller.userId,
      baseUrl,
    });
    return apiOk({
      id: result.id,
      short_id: result.shortId,
      url: result.url,
    });
  } catch (err) {
    return apiInternalError(err, "POST /api/admin/customer-intake-links");
  }
}
