import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

const updateSchema = z.object({
  performed_at: z.string().trim().min(1, "実施日時を入力してください。"),
  content: z.string().trim().min(1, "メンテナンス内容を入力してください。").max(5000),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { id } = await params;
    if (!UUID_RE.test(id)) return apiValidationError("id の形式が不正です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const performedAt = new Date(parsed.data.performed_at);
    if (Number.isNaN(performedAt.getTime())) {
      return apiValidationError("実施日時の形式が不正です。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: existing, error: fetchError } = await admin
      .from("certificate_maintenance_logs")
      .select("id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (fetchError) return apiInternalError(fetchError, "maintenance log fetch");
    if (!existing) return apiNotFound("メンテナンス記録が見つかりません。");

    const { error: updateError } = await admin
      .from("certificate_maintenance_logs")
      .update({
        performed_at: performedAt.toISOString(),
        content: parsed.data.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (updateError) return apiInternalError(updateError, "maintenance log update");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "maintenance log update");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { id } = await params;
    if (!UUID_RE.test(id)) return apiValidationError("id の形式が不正です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { error } = await admin
      .from("certificate_maintenance_logs")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "maintenance log delete");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "maintenance log delete");
  }
}
