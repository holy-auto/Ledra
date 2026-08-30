import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/mobile/account — 本人によるアカウント削除。
 *
 * Apple App Store Guideline 5.1.1(v): アカウント作成を提供するアプリは、
 * アプリ内からアカウント削除を開始できなければならない。
 *
 * 挙動（データ損失を避けるため保守的に設計）:
 *   1. 呼び出し元が所属テナントの「唯一の owner」の場合
 *      → テナントを is_active=false に無効化し、テナント上の連絡先 PII
 *        (contact_email / contact_phone) を消去する。施工履歴等の業務
 *        レコードは保持義務の可能性があるため物理削除しない（保持方針は
 *        OPEN_QUESTIONS 参照）。
 *   2. 他に owner が残る / staff 等の場合
 *      → テナントはそのまま。本人のみ削除する。
 *   3. いずれの場合も Supabase Auth ユーザーを削除する。
 *      tenant_memberships.user_id は ON DELETE CASCADE のため、ユーザー
 *      削除でメンバーシップ行も自動的に消える（＝ログイン不能になる）。
 *
 * 認証は Bearer Token（resolveMobileCaller）。破壊的操作なので削除自体は
 * service role で行う。
 */
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const admin = createServiceRoleAdmin("mobile:account-delete — user-initiated account deletion (Apple 5.1.1(v))");

    // ── テナント内の owner 状況を確認 ──
    // 本人以外に owner が残るかどうかで、テナントを無効化するか判断する。
    const { data: owners, error: ownersError } = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", caller.tenantId)
      .eq("role", "owner");

    if (ownersError) {
      return apiInternalError(ownersError, "mobile.account.delete: owners lookup");
    }

    const otherOwners = (owners ?? []).filter((o) => o.user_id !== caller.userId);
    const isSoleOwner = caller.role === "owner" && otherOwners.length === 0;

    // ── 唯一の owner なら、テナントを無効化し PII を消去 ──
    // ユーザー削除より先に行う。ここで失敗したら退会自体を中止し、
    // 「ログインは消えたが店舗だけ残る」中途半端な状態を避ける。
    if (isSoleOwner) {
      const { error: tenantError } = await admin
        .from("tenants")
        .update({
          is_active: false,
          contact_email: null,
          contact_phone: null,
        })
        .eq("id", caller.tenantId);

      if (tenantError) {
        return apiInternalError(tenantError, "mobile.account.delete: tenant deactivate");
      }
    }

    // ── Auth ユーザー削除（メンバーシップは ON DELETE CASCADE で自動削除） ──
    const { error: deleteError } = await admin.auth.admin.deleteUser(caller.userId);
    if (deleteError) {
      return apiInternalError(deleteError, "mobile.account.delete: auth user deletion");
    }

    return apiOk({ deleted: true, tenant_deactivated: isSoleOwner });
  } catch (e) {
    return apiInternalError(e, "mobile.account.delete");
  }
}
