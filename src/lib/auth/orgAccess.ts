import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeOrgRole, type OrgRole } from "./orgRoles";

/**
 * 組織 (本社) アクセス権の解決。
 *
 * - owner    : organizations.owner_id 本人。組織・本社チーム・所属店舗の管理が可能。
 * - org_*    : organization_users のメンバー (org_admin / org_viewer)。横断閲覧のみ。
 *
 * いずれも RLS を尊重する server クライアントで判定する:
 *   - organizations は owner_id = auth.uid() の行のみ可視 (= 存在すれば owner)。
 *   - organization_users は user_id = auth.uid() の自分の行が可視。
 */

export type OrgAccessLevel = "owner" | OrgRole;

export interface OrgAccess {
  level: OrgAccessLevel;
  /** 書込 (本社チーム / 所属店舗の管理) を許可するか = owner のみ。 */
  canManage: boolean;
}

/**
 * caller が当該組織に対して持つアクセス権を返す。所属が無ければ null。
 */
export async function resolveOrgAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  userId: string,
): Promise<OrgAccess | null> {
  // owner 判定 (RLS: owner_id = auth.uid() の組織のみ見える)。
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (org) return { level: "owner", canManage: true };

  // 本社チームメンバー判定 (RLS: 自分の org_users 行が見える)。
  const { data: member } = await supabase
    .from("organization_users")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (member) return { level: normalizeOrgRole(member.role), canManage: false };

  return null;
}
