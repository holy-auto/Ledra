import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError, apiOk } from "@/lib/api/response";
import { layoutConfigSchema, templateCreateSchema, templateUpdateSchema } from "@/types/documentTemplate";

export const dynamic = "force-dynamic";

const SELECT_COLS = "id, tenant_id, name, doc_type, layout_config, is_default, created_at, updated_at";

// ─── GET: テンプレート一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const docType = url.searchParams.get("doc_type") ?? "";

    let query = supabase
      .from("document_templates")
      .select(SELECT_COLS)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (docType) {
      // doc_type === "common" は NULL（共通テンプレ）
      if (docType === "common") {
        query = query.is("doc_type", null);
      } else {
        query = query.or(`doc_type.eq.${docType},doc_type.is.null`);
      }
    }

    const { data, error } = await query;
    if (error) return apiInternalError(error, "document_templates GET");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("default_template_id")
      .eq("id", caller.tenantId)
      .single();

    return apiJson({
      templates: data ?? [],
      tenant_default_template_id: tenant?.default_template_id ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "document_templates GET");
  }
}

// ─── POST: テンプレート作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const parsed = templateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力値が不正です");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // is_default を立てる場合は同スコープ（tenant + doc_type）の既存デフォルトを下ろす
    if (parsed.data.is_default) {
      await admin
        .from("document_templates")
        .update({ is_default: false })
        .eq("tenant_id", caller.tenantId)
        .eq("is_default", true)
        .then((r) => r);
    }

    const { data, error } = await admin
      .from("document_templates")
      .insert({
        tenant_id: caller.tenantId,
        name: parsed.data.name,
        doc_type: parsed.data.doc_type ?? null,
        layout_config: parsed.data.layout_config,
        is_default: parsed.data.is_default,
      })
      .select(SELECT_COLS)
      .single();

    if (error) return apiInternalError(error, "document_templates POST");
    return apiOk({ template: data });
  } catch (e) {
    return apiInternalError(e, "document_templates POST");
  }
}

// ─── PUT: テンプレート更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const parsed = templateUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力値が不正です");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.doc_type !== undefined) updates.doc_type = parsed.data.doc_type ?? null;
    if (parsed.data.layout_config !== undefined) {
      const layoutParsed = layoutConfigSchema.safeParse(parsed.data.layout_config);
      if (!layoutParsed.success) {
        return apiValidationError("レイアウト設定が不正です");
      }
      updates.layout_config = layoutParsed.data;
    }
    if (parsed.data.is_default !== undefined) updates.is_default = parsed.data.is_default;

    if (parsed.data.is_default === true) {
      await admin
        .from("document_templates")
        .update({ is_default: false })
        .eq("tenant_id", caller.tenantId)
        .eq("is_default", true)
        .neq("id", parsed.data.id);
    }

    const { data, error } = await admin
      .from("document_templates")
      .update(updates)
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLS)
      .single();

    if (error) return apiInternalError(error, "document_templates PUT");
    if (!data) return apiNotFound("テンプレートが見つかりません");
    return apiOk({ template: data });
  } catch (e) {
    return apiInternalError(e, "document_templates PUT");
  }
}

// ─── DELETE: テンプレート削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("document_templates").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "document_templates DELETE");
    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "document_templates DELETE");
  }
}
