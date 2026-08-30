import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { buildInboundAddress, generateInboundToken, inboundEmailDomain } from "@/lib/email/inboundAddress";
import { requireAal2OrResponse } from "@/lib/auth/stepUpGuard";
import { readInboundEmailToken, writeInboundEmailToken } from "@/lib/security/tenantPrivateSecrets";

export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/email-inbound — メール予約取り込みの状態と受信アドレスを返す。
 * POST /api/admin/email-inbound — { enabled } で有効/無効を切り替える。
 *                                 有効化時に受信トークンを (無ければ) 発行する。
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden("テナントオーナーのみ操作できます。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const [{ data: tenant, error }, token] = await Promise.all([
      admin.from("tenants").select("email_inbound_enabled").eq("id", caller.tenantId).single(),
      readInboundEmailToken(admin, caller.tenantId),
    ]);
    if (error) throw error;

    return apiOk({
      enabled: !!tenant?.email_inbound_enabled,
      address: buildInboundAddress(token),
      domain_configured: !!inboundEmailDomain(),
    });
  } catch (e) {
    return apiInternalError(e, "email-inbound status");
  }
}

const schema = z.object({ enabled: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) return apiForbidden("テナントオーナーのみ操作できます。");
    const stepUpDenied = await requireAal2OrResponse(supabase);
    if (stepUpDenied) return stepUpDenied;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    // 有効化時にトークンが無ければ発行する (無効化ではトークンは温存し再有効化を容易に)。
    let token = await readInboundEmailToken(admin, caller.tenantId);
    if (parsed.data.enabled && !token) {
      token = generateInboundToken();
      await writeInboundEmailToken(admin, caller.tenantId, token);
    }

    const { error: upErr } = await admin
      .from("tenants")
      .update({ email_inbound_enabled: parsed.data.enabled })
      .eq("id", caller.tenantId);
    if (upErr) throw upErr;

    return apiOk({
      enabled: parsed.data.enabled,
      address: buildInboundAddress(token),
      domain_configured: !!inboundEmailDomain(),
    });
  } catch (e) {
    return apiInternalError(e, "email-inbound update");
  }
}
