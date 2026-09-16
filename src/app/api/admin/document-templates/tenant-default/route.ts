
import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiInternalError, apiOk, apiValidationError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
const tenantDefaultSchema = z.object({
  template_id: z.string().uuid().nullable(),
});

export const dynamic = "force-dynamic";

/** テナント全体の既定テンプレートを設定 */
export const PUT = withCaller(
  async (req, { caller }) => {
    try {
      // 帳票テンプレートの既定変更は admin 以上 (代表判断 2026-09-01)

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
  },
  { permission: "templates:manage", routeName: "tenant-default PUT" },
);
