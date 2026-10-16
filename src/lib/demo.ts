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
 *   - 入口: `src/lib/demoWriteGuard.ts`（proxy）が、デモテナントの利用者の書き込みメソッドを 403 にする。
 *           サービスロールで書く API は RLS を素通りするので、こちらが本体。
 *   - DB 側: supabase/migrations/20261016135012_demo_member_readonly_all_tables.sql の
 *            RESTRICTIVE RLS ポリシーが、デモテナントの所属者の利用者権限での書き込みを
 *            public の全表と Storage で拒否する（ブラウザから PostgREST を直接叩く経路。
 *            サービスロールには効かない）。新しい表への付け忘れは scripts/replay/checks/demo_member_readonly.sql が落とす。
 *            判定は所属なので、デモテナントに所属した人はどのテナントでも書けなくなる（公開アカウントだけを置く）。
 *            ほかに 20260514000001 が certificates / vehicles / customers の「デモテナントの行」への
 *            書き込みを、誰からでも拒否している。
 *   - UI 側: `DemoTenantBanner` がダッシュボード上部に「読み取り専用」表示を出す。
 */

export const DEMO_TENANT_ID = "00000000-0000-0000-0000-de0000000010";

export const DEMO_TENANT_SLUG = "ledra-motors-demo";

export const DEMO_EMAIL = "demo@ledra-motors.example";

export const DEMO_PASSWORD = "Demo1234!";

export function isDemoTenant(tenantId: string | null | undefined): boolean {
  return tenantId === DEMO_TENANT_ID;
}
