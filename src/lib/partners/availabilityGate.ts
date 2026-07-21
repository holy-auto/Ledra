import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/**
 * 取引先ゲート: 閲覧側テナント A が対象テナント B の空きを見られるか。
 *
 * 許可条件 = 「B が A を取引先/顧客として登録し、空き公開を許可している」
 * = B の customers に `linked_tenant_id = A` かつ `share_availability` の行が存在する。
 * （Phase 1 の指名BtoB請求で B は A を顧客登録済み。その関係を空き公開の同意として再利用する。）
 *
 * サービスロールで存在確認（B の customers は A から RLS では読めないため）。
 */
export async function partnerCanViewAvailability(viewerTenantId: string, targetTenantId: string): Promise<boolean> {
  if (!viewerTenantId || !targetTenantId || viewerTenantId === targetTenantId) return false;

  const admin = createServiceRoleAdmin(
    "partners/availabilityGate: 取引先の空き公開同意チェック (B の customers.linked_tenant_id=A)",
  );

  const { data } = await admin
    .from("customers")
    .select("id")
    .eq("tenant_id", targetTenantId)
    .eq("linked_tenant_id", viewerTenantId)
    .eq("share_availability", true)
    .limit(1)
    .maybeSingle();

  return !!data;
}
