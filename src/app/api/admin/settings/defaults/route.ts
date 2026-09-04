import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

const settingsDefaultsSchema = z.object({
  default_warranty_exclusions: z.string().max(5000).default(""),
});

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
    // tenants.default_warranty_exclusions（テナント全体の既定値）の変更。設定系の
    // 既存API 9本と同じ settings:edit を要求する。呼び出し元は /admin/settings ではなく
    // /admin/certificates/new の「デフォルトとして保存」(CertNewFormWrapper.tsx)。
    // なお staff は元々 tenants の RLS（tenants_update_owner_admin = owner/admin/super_admin）
    // で 0 行更新になり、それでも {ok:true} が返っていた。403 は挙動の後退ではなく、
    // 黙って失敗していたものを正直にしたもの。ボタン自体の出し分けは未対応。
    if (!requirePermission(caller, "settings:edit")) return apiForbidden();

    const parsed = settingsDefaultsSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { default_warranty_exclusions: value } = parsed.data;

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
