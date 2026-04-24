import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** GET: テナントのデフォルト保証除外内容を取得 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase
      .from("tenants")
      .select("default_warranty_exclusions")
      .eq("id", caller.tenantId)
      .single();

    if (error) {
      return apiInternalError(error, "admin/settings/defaults GET");
    }

    return apiJson({
      default_warranty_exclusions: data?.default_warranty_exclusions ?? "",
    });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/settings/defaults GET");
  }
}

/** PUT: テナントのデフォルト保証除外内容を更新 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const value = typeof body.default_warranty_exclusions === "string" ? body.default_warranty_exclusions : "";

    const { error } = await supabase
      .from("tenants")
      .update({ default_warranty_exclusions: value })
      .eq("id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "admin/settings/defaults PUT");
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/settings/defaults PUT");
  }
}
