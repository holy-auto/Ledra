
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { inspectionTemplateCreateSchema, inspectionTemplateUpdateSchema } from "@/lib/validations/inspection";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLUMNS = "id, name, items, is_default, is_active, sort_order, created_at, updated_at";

// ─── GET: 点検テンプレート一覧 ───
export const GET = withCaller(
  async (_req, { caller }) => {
    try {

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: templates, error } = await admin
        .from("inspection_templates")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) return apiInternalError(error, "inspection-templates GET");

      return apiJson({ templates: templates ?? [] });
    } catch (e) {
      return apiInternalError(e, "inspection-templates GET");
    }
  },
  { routeName: "inspection-templates GET" },
);

// ─── POST: 点検テンプレート作成 ───
export const POST = withCaller(
  async (req, { caller }) => {
    try {

      const parsed = inspectionTemplateCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const input = parsed.data;

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // is_default を立てる場合、先に同テナントの他テンプレの is_default を落とす。
      if (input.is_default) {
        const { error: unsetErr } = await admin
          .from("inspection_templates")
          .update({ is_default: false })
          .eq("tenant_id", caller.tenantId)
          .eq("is_default", true);
        if (unsetErr) return apiInternalError(unsetErr, "inspection-templates POST unset default");
      }

      const { data: created, error } = await admin
        .from("inspection_templates")
        .insert({
          tenant_id: caller.tenantId,
          name: input.name,
          items: input.items,
          is_default: input.is_default,
          is_active: true,
          sort_order: input.sort_order,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) return apiInternalError(error, "inspection-templates POST");

      return apiJson({ ok: true, template: created }, { status: 201 });
    } catch (e) {
      return apiInternalError(e, "inspection-templates POST");
    }
  },
  { minRole: "staff", routeName: "inspection-templates POST" },
);

// ─── PATCH: 点検テンプレート更新 (body に id) ───
export const PATCH = withCaller(
  async (req, { caller }) => {
    try {

      const parsed = inspectionTemplateUpdateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { id, ...fields } = parsed.data;

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // 部分更新: undefined のキーは送らない。
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }

      // is_default を true にする場合、先に同テナントの他テンプレの is_default を落とす。
      if (fields.is_default === true) {
        const { error: unsetErr } = await admin
          .from("inspection_templates")
          .update({ is_default: false })
          .eq("tenant_id", caller.tenantId)
          .eq("is_default", true)
          .neq("id", id);
        if (unsetErr) return apiInternalError(unsetErr, "inspection-templates PATCH unset default");
      }

      const { data: updated, error } = await admin
        .from("inspection_templates")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select(SELECT_COLUMNS)
        .maybeSingle();
      if (error) return apiInternalError(error, "inspection-templates PATCH");
      if (!updated) return apiValidationError("対象の点検テンプレートが見つかりません。");

      return apiJson({ ok: true, template: updated });
    } catch (e) {
      return apiInternalError(e, "inspection-templates PATCH");
    }
  },
  { minRole: "staff", routeName: "inspection-templates PATCH" },
);
