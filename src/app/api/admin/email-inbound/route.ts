import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { buildInboundAddress, generateInboundToken, inboundEmailDomain } from "@/lib/email/inboundAddress";

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
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant, error } = await admin
      .from("tenants")
      .select("email_inbound_token, email_inbound_enabled")
      .eq("id", caller.tenantId)
      .single();
    if (error) throw error;

    return apiOk({
      enabled: !!tenant?.email_inbound_enabled,
      address: buildInboundAddress(tenant?.email_inbound_token),
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
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: current, error: readErr } = await admin
      .from("tenants")
      .select("email_inbound_token")
      .eq("id", caller.tenantId)
      .single();
    if (readErr) throw readErr;

    // 有効化時にトークンが無ければ発行する (無効化ではトークンは温存し再有効化を容易に)。
    const update: { email_inbound_enabled: boolean; email_inbound_token?: string } = {
      email_inbound_enabled: parsed.data.enabled,
    };
    let token = (current?.email_inbound_token as string | null) ?? null;
    if (parsed.data.enabled && !token) {
      token = generateInboundToken();
      update.email_inbound_token = token;
    }

    const { error: upErr } = await admin.from("tenants").update(update).eq("id", caller.tenantId);
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
