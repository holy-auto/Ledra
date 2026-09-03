import "server-only";

import crypto from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import type { StaffPortfolioCertificate } from "@/lib/staff/portfolioDisclosure";

/**
 * 職人の施工実績リンク（読み取り専用）。
 *
 * なぜ要るか: 外注職人はログインアカウントを持たない設計なので（staff_members.user_id
 * は外注では null）、施工した本人が自分の記録を確認する手段が Ledra 上に無かった。
 * 証明書には craftsman_staff_id が刻まれている（20260617000004）ので、材料はある。
 * 足りないのは本人へ渡す導線だけ。
 *
 * 設計と失効条件はマイグレーション 20260903000000 のコメントに書いてある。
 */

/**
 * pepper は顧客ポータルと同じ CUSTOMER_AUTH_PEPPER を接頭辞でドメイン分離して流用する。
 * 新しい必須の環境変数を増やさないため（未設定なら顧客ポータルも動かないので運用上も同条件）。
 */
const PEPPER = process.env.CUSTOMER_AUTH_PEPPER!;

export function staffPortfolioTokenHash(token: string): string {
  if (!PEPPER) throw new Error("Missing CUSTOMER_AUTH_PEPPER");
  return crypto.createHash("sha256").update(`staffportfolio|v1|${token}|${PEPPER}`).digest("hex");
}

export type StaffPortfolio = {
  staff_name: string;
  shop_name: string;
  certificates: StaffPortfolioCertificate[];
};

function admin() {
  return createServiceRoleAdmin("staff portfolio link — token 照合と本人向けの実績表示");
}

/**
 * トークンから職人の実績を引く。無効なら null（理由は呼び出し元へ漏らさない）。
 *
 * 有効条件は3つすべて: token 一致 / link.is_active / staff_members.is_active。
 * 3つ目があるので、ロスターで「休止中」にすればリンクは自動的に死ぬ。
 */
export async function resolveStaffPortfolio(token: string): Promise<StaffPortfolio | null> {
  const raw = token.trim();
  if (!raw) return null;

  const db = admin();
  const { data: link } = await db
    .from("staff_portfolio_links")
    .select("id, tenant_id, staff_member_id, is_active")
    .eq("token_hash", staffPortfolioTokenHash(raw))
    .maybeSingle();
  if (!link?.is_active) return null;

  const [{ data: staff }, { data: tenant }] = await Promise.all([
    db
      .from("staff_members")
      .select("name, is_active")
      .eq("id", link.staff_member_id)
      .eq("tenant_id", link.tenant_id)
      .maybeSingle(),
    db.from("tenants").select("name, slug").eq("id", link.tenant_id).maybeSingle(),
  ]);
  // 在籍中でない職人のリンクは失効させる（離職時に別作業を要求しないための条件）。
  if (!staff?.is_active) return null;

  const { data: certs } = await db
    .from("certificates")
    .select("public_id, service_type, created_at")
    .eq("tenant_id", link.tenant_id)
    .eq("craftsman_staff_id", link.staff_member_id)
    .neq("status", "void")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(500);

  // 閲覧の記録はベストエフォート（失敗しても表示は止めない）。
  await db
    .from("staff_portfolio_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", link.id)
    .then(
      () => undefined,
      () => undefined,
    );

  return {
    staff_name: String(staff.name ?? ""),
    shop_name: String(tenant?.name ?? tenant?.slug ?? ""),
    certificates: (certs ?? []) as StaffPortfolioCertificate[],
  };
}

/**
 * リンクを発行（または再発行）する。**raw token を返すのはこの瞬間だけ**で、
 * DB にはハッシュしか残らない。紛失したら失効させて再発行する。
 */
export async function issueStaffPortfolioLink(
  tenantId: string,
  staffMemberId: string,
  createdBy: string | null,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const { error } = await admin()
    .from("staff_portfolio_links")
    .upsert(
      {
        tenant_id: tenantId,
        staff_member_id: staffMemberId,
        token_hash: staffPortfolioTokenHash(token),
        is_active: true,
        created_by: createdBy,
        created_at: new Date().toISOString(),
        last_viewed_at: null,
      },
      { onConflict: "tenant_id,staff_member_id" },
    );
  if (error) throw new Error(`issueStaffPortfolioLink failed: ${error.message}`);
  return token;
}

/** リンクを失効させる。行は履歴として残し is_active だけ倒す。 */
export async function revokeStaffPortfolioLink(tenantId: string, staffMemberId: string): Promise<void> {
  const { error } = await admin()
    .from("staff_portfolio_links")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("staff_member_id", staffMemberId);
  if (error) throw new Error(`revokeStaffPortfolioLink failed: ${error.message}`);
}
