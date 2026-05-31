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
 *
 * ⚠️ 特許出願ロック (PASSPORT_PATENT_HOLD)
 *   パスポートの中核であるメタアンカー機構は特許出願を検討中で、出願戦略が
 *   固まるまで公開ルートを開けてはいけない (docs/patents/04・05 §F)。検証 API は
 *   メタアンカーの集約値・構成 tx を返すため、公開すると機構が外部から読み取れる。
 *   PASSPORT_PATENT_HOLD が立っている間は、PASSPORT_PUBLIC_ENABLED の値に
 *   関わらず公開ルートを 404 のままにする「ハードロック」。本番 (production) では
 *   出願 GO/NO-GO が決まるまで PASSPORT_PATENT_HOLD=1 を設定しておくこと。
 *   誤って PASSPORT_PUBLIC_ENABLED=true を入れても公開されない。
 *   ロックを外すのは出願戦略の確定後、必ず弁理士確認を通してから。
 */

/**
 * 特許出願ロックが有効か。安全側 (公開しない側) に倒すため、ENABLED の厳密
 * "true" 判定と違って truthy 判定はゆるめにする ("1" / "true" / "yes" / "on")。
 * 未設定 (default) はロックなし → ローカル/staging の公開ルート開発を妨げない。
 */
function isPatentHoldActive(): boolean {
  const v = (process.env.PASSPORT_PATENT_HOLD ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isPassportPublicEnabled(): boolean {
  // 特許出願ロックが最優先。立っていれば PASSPORT_PUBLIC_ENABLED を無視して
  // 公開しない (docs/patents/05 §F)。
  if (isPatentHoldActive()) return false;
  return process.env.PASSPORT_PUBLIC_ENABLED === "true";
}
