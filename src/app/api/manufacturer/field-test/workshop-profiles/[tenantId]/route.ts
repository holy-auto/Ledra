import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { isParticipatingTenant } from "@/lib/fieldTest/applicationGate";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/workshop-profiles/[tenantId]
 *
 * メーカーは閲覧のみ。設備・資格は1施工店1行で他社とも共有のため、登録・更新は施工店本人だけ
 * （/api/admin・/api/mobile の field-test/workshop-profile）。PUT はここに置かない。
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const { tenantId } = await ctx.params;
  if (!z.string().uuid().safeParse(tenantId).success) return apiNotFound("プロファイルが見つかりません。");

  try {
    const admin = createServiceRoleAdmin("workshop profile detail");
    if (!(await isParticipatingTenant(admin, { manufacturerId: caller.manufacturerId, tenantId }))) {
      return apiNotFound("プロファイルが見つかりません。");
    }
    const { data, error } = await admin
      .from("workshop_capability_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return apiInternalError(error, "workshop profile GET");
    if (!data) return apiNotFound("プロファイルが見つかりません。");

    return apiJson({ profile: data });
  } catch (e) {
    return apiInternalError(e, "workshop profile GET");
  }
}
