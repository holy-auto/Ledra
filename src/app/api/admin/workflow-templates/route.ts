import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

export type WorkflowStep = {
  order: number;
  key: string;
  label: string;
  is_customer_visible: boolean;
  estimated_min: number;
};

// ─── GET: テンプレート一覧（プラットフォーム共通 + テナント固有） ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const serviceType = url.searchParams.get("service_type");

    let query = supabase
      .from("workflow_templates")
      .select("id, tenant_id, name, service_type, steps, is_default, is_platform, created_at, updated_at")
      .or(`tenant_id.eq.${caller.tenantId},tenant_id.is.null`)
      .order("is_platform", { ascending: false })
      .order("service_type", { ascending: true })
      .order("name", { ascending: true });

    if (serviceType) query = query.eq("service_type", serviceType);

    const { data, error } = await query;
    if (error) {
      console.error("[workflow-templates] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch (e: unknown) {
    console.error("[workflow-templates] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: テンプレート作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const name = String(body.name ?? "").trim();
    if (!name)
      return NextResponse.json({ error: "name_required", message: "テンプレート名は必須です" }, { status: 400 });

    const serviceType = String(body.service_type ?? "other");
    const validTypes = ["coating", "ppf", "wrapping", "body_repair", "other"];
    if (!validTypes.includes(serviceType)) {
      return NextResponse.json({ error: "invalid_service_type" }, { status: 400 });
    }

    // steps バリデーション
    const steps = (body.steps ?? []) as WorkflowStep[];
    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: "steps_required", message: "ステップは1つ以上必要です" }, { status: 400 });
    }

    // is_default を設定する場合、既存のデフォルトを解除
    if (body.is_default) {
      await supabase
        .from("workflow_templates")
        .update({ is_default: false })
        .eq("tenant_id", caller.tenantId)
        .eq("service_type", serviceType);
    }

    const { data, error } = await supabase
      .from("workflow_templates")
      .insert({
        tenant_id: caller.tenantId,
        name,
        service_type: serviceType,
        steps,
        is_default: !!body.is_default,
        is_platform: false,
      })
      .select()
      .single();

    if (error) {
      console.error("[workflow-templates] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, template: data }, { status: 201 });
  } catch (e: unknown) {
    console.error("[workflow-templates] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
