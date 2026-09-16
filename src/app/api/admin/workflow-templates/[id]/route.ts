

import { apiJson, apiForbidden, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { workflowTemplateUpdateSchema } from "@/lib/validations/workflow-template";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── PUT: テンプレート更新 ───
export const PUT = withCaller<{ id: string }>(
  async (req, { caller, supabase, params }) => {
    try {

      const { id } = params;
      const parsed = workflowTemplateUpdateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const fields = parsed.data;

      // プラットフォームテンプレートは更新不可（テナントはコピーのみ）
      const { data: existing } = await supabase
        .from("workflow_templates")
        .select("id, tenant_id, is_platform, service_type")
        .eq("id", id)
        .single();

      if (!existing) return apiNotFound("テンプレートが見つかりません。");
      if (existing.is_platform) {
        return apiForbidden("プラットフォームテンプレートは編集できません。コピーして編集してください。");
      }
      if (existing.tenant_id !== caller.tenantId) {
        return apiForbidden();
      }

      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }
      if (fields.is_default === true) {
        // is_default = true にする場合、同一service_typeの他テンプレートを解除
        await supabase
          .from("workflow_templates")
          .update({ is_default: false })
          .eq("tenant_id", caller.tenantId)
          .eq("service_type", existing.service_type)
          .neq("id", id);
      }

      const { data, error } = await supabase
        .from("workflow_templates")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select("id, tenant_id, name, service_type, steps, is_default, is_platform, created_at, updated_at")
        .single();

      if (error) {
        return apiInternalError(error, "workflow-templates PUT");
      }

      return apiJson({ ok: true, template: data });
    } catch (e: unknown) {
      return apiInternalError(e, "workflow-templates/[id] PUT");
    }
  },
  { minRole: "staff", routeName: "admin/workflow-templates/[id] PUT" },
);

// ─── DELETE: テンプレート削除 ───
export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {

      const { id } = params;

      // プラットフォームテンプレートは削除不可
      const { data: existing } = await supabase
        .from("workflow_templates")
        .select("id, tenant_id, is_platform")
        .eq("id", id)
        .single();

      if (!existing) return apiNotFound("テンプレートが見つかりません。");
      if (existing.is_platform) {
        return apiForbidden("プラットフォームテンプレートは削除できません。");
      }
      if (existing.tenant_id !== caller.tenantId) {
        return apiForbidden();
      }

      const { error } = await supabase.from("workflow_templates").delete().eq("id", id).eq("tenant_id", caller.tenantId);

      if (error) {
        return apiInternalError(error, "workflow-templates DELETE");
      }

      return apiJson({ ok: true });
    } catch (e: unknown) {
      return apiInternalError(e, "workflow-templates/[id] DELETE");
    }
  },
  { minRole: "staff", routeName: "admin/workflow-templates/[id] DELETE" },
);
