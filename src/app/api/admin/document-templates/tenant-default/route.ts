import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiInternalError, apiOk, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** テナント全体の既定テンプレートを設定 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as any);
    const templateId = body?.template_id ?? null;

    if (templateId !== null && typeof templateId !== "string") {
      return apiValidationError("template_id must be a UUID string or null");
    }

    const admin = getSupabaseAdmin();

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
