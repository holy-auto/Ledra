import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { issueStaffLinkInvite, unlinkStaffTenant } from "@/lib/staff/tenantLink";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ staff_member_id: z.string().uuid() });

/**
 * 元請け側: 外注職人へ渡す連携コードの発行と、連携の解除。
 *
 * ロスター（連絡先を含む）と同じ members:manage に揃える。連携が成立すると相手は
 * 自分が施工した記録を読めるようになるので、在籍管理と同じ重さの操作として扱う。
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

/** POST: 発行（再発行）。raw code を返すのは**このレスポンスだけ**。 */
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
    // 休止中の職人はそもそも連携しても記録が出ない。発行できたつもりにさせない。
    if (!staff.is_active) return apiValidationError("休止中の職人にはコードを発行できません。");

    const { code, expiresAt } = await issueStaffLinkInvite(caller.tenantId, staff.id as string, caller.userId);
    return apiJson({ ok: true, code, expires_at: expiresAt, staff_name: staff.name });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/staff/link-invite POST");
  }
}

/** DELETE: 連携の解除。職人行はそのまま、繋がりだけ切る。 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "members:manage")) return apiForbidden();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("staff_member_id が不正です。");

    await unlinkStaffTenant(caller.tenantId, parsed.data.staff_member_id);
    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/staff/link-invite DELETE");
  }
}
