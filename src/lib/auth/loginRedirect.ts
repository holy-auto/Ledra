import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * ログイン後のデフォルトリダイレクト先をコンテキストに基づいて決定する。
 * - 施工店のみ → /admin/certificates
 * - 代理店のみ → /agent
 * - 両方 → 前回のアクティブコンテキスト or デフォルト施工店
 * - 本社専用ユーザ（組織オーナー / 本社チーム） → /admin/hq-overview
 * - どちらでもない → /admin/certificates (施工店登録フローへ)
 *
 * パスワードログイン（server action）とマジックリンクの /auth/callback の
 * 双方から呼ばれるため、ここに集約している。
 */
export async function resolveDefaultRedirect(userId: string, activeContext: string | null): Promise<string> {
  const admin = createServiceRoleAdmin(
    "login redirect — resolves whether user has tenant membership or agent record, pre-resolution",
  );

  // 施工店メンバーシップ確認
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const hasShop = !!membership?.tenant_id;

  // 代理店確認
  const { data: agentRecord } = await admin.from("agents").select("id, status").eq("user_id", userId).maybeSingle();

  const hasAgent = !!agentRecord?.id && agentRecord.status === "active";

  if (hasShop && hasAgent) {
    // 両方持っている: 前回のコンテキストまたはデフォルト施工店
    if (activeContext === "agent") return "/agent";
    return "/admin/certificates";
  }

  if (hasAgent) return "/agent";

  // 施工店も代理店も無い場合、本社専用ユーザ (組織オーナー / 本社チーム) なら
  // 本社横断ビューへ。そうでなければ従来どおり施工店登録フローへ。
  if (!hasShop) {
    const { data: ownedOrg } = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    let isOrgUser = !!ownedOrg?.id;
    if (!isOrgUser) {
      const { data: orgMember } = await admin
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      isOrgUser = !!orgMember?.organization_id;
    }
    if (isOrgUser) return "/admin/hq-overview";
  }

  return "/admin/certificates";
}
