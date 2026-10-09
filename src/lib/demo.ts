/**
 * デモテナント関連の定数・ヘルパー。
 *
 * デモテナントは「Ledra Motors（デモ）」で、`scripts/setup-demo-tenant.ts`
 * によってサンプルデータ（証明書27件 / 車両11台 / 顧客9名）と共に作成される。
 *
 * デモアカウントは `scripts/setup-demo-tenant-user.ts` で作成される owner 権限の
 * ユーザーで、HP の「デモを見る」導線（/demo ページ）からログイン情報が案内される。
 *
 * リードオンリー化:
 *   - DB 側: supabase/migrations/20260513000001_demo_tenant_readonly.sql の
 *            RESTRICTIVE RLS ポリシーが certificates / vehicles / customers
 *            への書き込みを拒否する。
 *   - UI 側: `DemoTenantBanner` がダッシュボード上部に「読み取り専用」表示を出す。
 */

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-de0000000010";

export const DEMO_TENANT_SLUG = "ledra-motors-demo";

export const DEMO_EMAIL = "demo@ledra-motors.example";

export const DEMO_PASSWORD = "Demo1234!";

export function isDemoTenant(tenantId: string | null | undefined): boolean {
  return tenantId === DEMO_TENANT_ID;
}
