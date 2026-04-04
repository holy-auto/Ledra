import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import type { WorkflowStep } from "../route";

export const dynamic = "force-dynamic";

// ─── PUT: テンプレート更新 ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

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
    if (body.name !== undefined) updates.name = String(body.name ?? "").trim();
    if (body.steps !== undefined) {
      const steps = body.steps as WorkflowStep[];
      if (!Array.isArray(steps) || steps.length === 0) {
        return apiValidationError("ステップは1つ以上必要です");
      }
      updates.steps = steps;
    }
    if (body.is_default !== undefined) {
      updates.is_default = !!body.is_default;
      // is_default = true にする場合、同一service_typeの他テンプレートを解除
      if (updates.is_default) {
        await supabase
          .from("workflow_templates")
          .update({ is_default: false })
          .eq("tenant_id", caller.tenantId)
          .eq("service_type", existing.service_type)
          .neq("id", id);
      }
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

    return NextResponse.json({ ok: true, template: data });
  } catch (e: unknown) {
    return apiInternalError(e, "workflow-templates/[id] PUT");
  }
}

// ─── DELETE: テンプレート削除 ───
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;

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

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "workflow-templates/[id] DELETE");
  }
}
