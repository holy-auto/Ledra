import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import type { WorkflowStep } from "../route";

export const dynamic = "force-dynamic";

// ─── PUT: テンプレート更新 ───
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // プラットフォームテンプレートは更新不可（テナントはコピーのみ）
    const { data: existing } = await supabase
      .from("workflow_templates")
      .select("id, tenant_id, is_platform, service_type")
      .eq("id", id)
      .single();

    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (existing.is_platform) {
      return NextResponse.json(
        {
          error: "platform_template_immutable",
          message: "プラットフォームテンプレートは編集できません。コピーして編集してください。",
        },
        { status: 403 },
      );
    }
    if (existing.tenant_id !== caller.tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name ?? "").trim();
    if (body.steps !== undefined) {
      const steps = body.steps as WorkflowStep[];
      if (!Array.isArray(steps) || steps.length === 0) {
        return NextResponse.json({ error: "steps_required" }, { status: 400 });
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
      .select()
      .single();

    if (error) {
      console.error("[workflow-templates] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, template: data });
  } catch (e: unknown) {
    console.error("[workflow-templates/[id]] PUT failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: テンプレート削除 ───
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;

    // プラットフォームテンプレートは削除不可
    const { data: existing } = await supabase
      .from("workflow_templates")
      .select("id, tenant_id, is_platform")
      .eq("id", id)
      .single();

    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (existing.is_platform) {
      return NextResponse.json({ error: "platform_template_immutable" }, { status: 403 });
    }
    if (existing.tenant_id !== caller.tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("workflow_templates").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[workflow-templates] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[workflow-templates/[id]] DELETE failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
