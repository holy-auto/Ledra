import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

/** GET: テナントのデフォルト保証除外内容を取得 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("tenants")
      .select("default_warranty_exclusions")
      .eq("id", caller.tenantId)
      .single();

    if (error) {
      console.error("[admin/settings/defaults] GET db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({
      default_warranty_exclusions: data?.default_warranty_exclusions ?? "",
    });
  } catch (e: unknown) {
    console.error("admin settings defaults GET failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/** PUT: テナントのデフォルト保証除外内容を更新 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const value = typeof body.default_warranty_exclusions === "string"
      ? body.default_warranty_exclusions
      : "";

    const { error } = await supabase
      .from("tenants")
      .update({ default_warranty_exclusions: value })
      .eq("id", caller.tenantId);

    if (error) {
      console.error("[admin/settings/defaults] PUT db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("admin settings defaults PUT failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
