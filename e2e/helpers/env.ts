/**
 * IMP-052: E2E テスト環境変数ヘルパー。
 *
 * 認証情報の存在チェックを集約。未設定時は test.skip でスキップ。
 *
 * ponytail: 管理者クレデンシャルは既存の `./auth` の `hasAdminCreds()` と
 * 完全に重複していたため、二重定義を避けてそちらを再エクスポートする
 * （`adminCreds` という名前は既存 spec からの呼び出しに合わせて維持）。
 * insurer/agent 用クレデンシャルと `baseUrl()` は呼び出し元が無かったため削除
 * （YAGNI — 保険会社/代理店ポータルの E2E を書く際に改めて追加する）。
 */
import { hasAdminCreds, type Credentials } from "./auth";

export type { Credentials };

/** 管理者 (admin/staff) クレデンシャル */
export const adminCreds = hasAdminCreds;

/** 顧客ポータル テナントスラグ + OTP テスト用電話番号 */
export function customerPortalConfig(): { tenantSlug: string; phone: string } | null {
  const tenantSlug = process.env.E2E_TENANT_SLUG;
  const phone = process.env.E2E_CUSTOMER_PHONE;
  return tenantSlug && phone ? { tenantSlug, phone } : null;
}
