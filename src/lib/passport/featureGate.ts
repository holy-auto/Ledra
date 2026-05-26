/**
 * 車両パスポート公開機能のフィーチャーゲート。
 *
 * 本番ローンチ前に内部開発を続けたいケース (現状) では、匿名から到達できる
 * 公開ルート群を環境変数で一括 404 化する。
 *
 *   PASSPORT_PUBLIC_ENABLED=true   → 全公開ルート有効
 *   それ以外 / 未設定 (default)     → 公開ルートは 404
 *
 * ゲート対象 (anonymous-reachable):
 *   - /v/[vin]                                公開パスポートページ
 *   - /api/v1/passport/verify                 第三者検証 API
 *   - /api/v1/passport/marketplace-info       中古車店向け拡張 API
 *   - /api/v1/passport/referrals/claim        紹介料 claim API
 *   - /passport/transfer/[token]              所有権移転受諾ページ
 *   - /api/passport/transfers/[token]/*       受諾/辞退 API
 *   - /api/public/vehicle-report/checkout     買取店向け都度課金
 *   - /api/public/vehicle-report/unlock       決済成功 → Cookie 付与
 *   - /c/[public_id] の "全履歴を見る" バッジ  (非表示)
 *
 * ゲート対象外 (auth 保護で OK、内部開発を継続するため):
 *   - /admin/vehicles/[id]/passport-transfer  admin 限定
 *   - /api/passport/transfers/{initiate,cancel} admin 限定
 *   - /api/cron/passport-transfers-expire     cron 内部
 */
export function isPassportPublicEnabled(): boolean {
  return process.env.PASSPORT_PUBLIC_ENABLED === "true";
}
