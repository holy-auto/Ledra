import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { issueStaffPortfolioLink, revokeStaffPortfolioLink } from "@/lib/staff/portfolioLink";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ staff_member_id: z.string().uuid() });

/**
 * 職人の施工実績リンクの発行・失効。
 *
 * ロスター（連絡先を含む）と同じ members:manage に揃える。リンクは本人以外に渡ると
 * 施工履歴が読めてしまうので、在籍管理と同じ重さの操作として扱う。
 */
async function resolveTargetStaff(tenantId: string, staffMemberId: string) {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data } = await admin
    .from("staff_members")
    .select("id, name, is_active")
    .eq("id", staffMemberId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

/** POST: 発行（再発行）。raw token を返すのは**このレスポンスだけ**。 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("staff_member_id が不正です。");

    const staff = await resolveTargetStaff(caller.tenantId, parsed.data.staff_member_id);
    if (!staff) return apiValidationError("該当の職人が見つかりません。");
    // 休止中の職人にリンクを配っても resolveStaffPortfolio 側で失効扱いになる。
    // 発行できたつもりにさせないよう、ここで断る。
    if (!staff.is_active) return apiValidationError("休止中の職人にはリンクを発行できません。");

    const token = await issueStaffPortfolioLink(caller.tenantId, staff.id as string, caller.userId);
    return apiJson({ ok: true, token, staff_name: staff.name });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/staff/portfolio-link POST");
  }
}

/** DELETE: 失効。行は履歴として残す。 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("staff_member_id が不正です。");

    await revokeStaffPortfolioLink(caller.tenantId, parsed.data.staff_member_id);
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/staff/portfolio-link DELETE");
  }
}
