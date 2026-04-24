import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError, apiOk, apiValidationError } from "@/lib/api/response";

const tenantDefaultSchema = z.object({
  template_id: z.string().uuid().nullable(),
});

export const dynamic = "force-dynamic";

/** テナント全体の既定テンプレートを設定 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = tenantDefaultSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const templateId = parsed.data.template_id;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (templateId) {
      const { data: tpl } = await admin
        .from("document_templates")
        .select("id")
        .eq("id", templateId)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (!tpl) return apiValidationError("指定されたテンプレートが見つかりません");
    }

    const { error } = await admin.from("tenants").update({ default_template_id: templateId }).eq("id", caller.tenantId);

    if (error) return apiInternalError(error, "tenant-default PUT");
    return apiOk({ default_template_id: templateId });
  } catch (e) {
    return apiInternalError(e, "tenant-default PUT");
  }
}
