/**
 * Tap to Pay on iPhone entitlement を一時的に除去するための config plugin。
 *
 * 背景:
 *   Apple 側の Tap to Pay 承認が現在 "Provisioning Support: Development" 限定で
 *   Distribution provisioning profile には entitlement が付与されない状態。
 *   App ID の capability 設定ポップアップで以下のように表示される:
 *     Platform Support:     iOS
 *     Provisioning Support: Development   ← これが "Distribution" になる必要がある
 *     Entitlement Keys:     com.apple.developer.proximity-reader.payment.acceptance
 *
 *   この状態で ios/<project>/<project>.entitlements に当該 entitlement が含まれると
 *   Xcode の signing 段階で
 *     "Entitlement com.apple.developer.proximity-reader.payment.acceptance
 *      not found and could not be included in profile"
 *   エラーになり App Store ビルドが失敗する。
 *
 * 復帰手順:
 *   Apple Developer Support (TSI) 経由で Distribution 承認を取得し、
 *   App ID 設定ポップアップが "Provisioning Support: Development, Distribution" と
 *   表示されるようになったら、以下の順で本 plugin を外して entitlement を復活させる。
 *
 *     1. app.json の plugins 配列から
 *        "./plugins/withRemoveTapToPayEntitlement" を削除
 *     2. app.json の ios セクションに以下を追加
 *          "entitlements": {
 *            "com.apple.developer.proximity-reader.payment.acceptance": true
 *          }
 *     3. eas credentials --platform ios で profile を削除して新規生成
 *     4. eas build --platform ios --profile production --clear-cache
 *
 * 詳細は docs/mobile-release-tap-to-pay.md を参照。
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require -- Expo config plugins are loaded via CommonJS require()
const { withEntitlementsPlist } = require("expo/config-plugins");

const TAP_TO_PAY_ENTITLEMENT =
  "com.apple.developer.proximity-reader.payment.acceptance";

/**
 * 2026-05 update:
 *   Apple から Development Distribution Entitlement が付与されたため、
 *   development プロファイル（Development provisioning profile）のビルドでは
 *   この plugin をスキップ（entitlement を残したまま）にする。
 *
 * 2026-08 update:
 *   preview（internal＝AdHoc）と production は **Distribution 型**の
 *   provisioning profile を使う。Apple はまだ TTP の publishing
 *   (Distribution) entitlement を付与していないため、これらの profile には
 *   proximity-reader.payment.acceptance を含められず、含めると fastlane が
 *   "Entitlement ... not found and could not be included in profile" で失敗
 *   する。よって **development 以外（preview / production）では除去**する。
 *   Distribution entitlement が付与されたら、下の shouldKeep 条件に
 *   "preview" を戻す（App Store 提出=production は付与後に別途復活）。
 *
 *   EAS Build は EAS_BUILD_PROFILE 環境変数にプロファイル名を入れる。
 */
module.exports = function withRemoveTapToPayEntitlement(config) {
  const profile = process.env.EAS_BUILD_PROFILE;
  // Development provisioning profile のみ dev-granted entitlement を含められる。
  const shouldKeep = profile === "development";

  return withEntitlementsPlist(config, (mod) => {
    if (shouldKeep) {
      // 開発ビルドでは entitlement を残し、Tap to Pay を実機で動作させる
      return mod;
    }
    if (mod.modResults && TAP_TO_PAY_ENTITLEMENT in mod.modResults) {
      delete mod.modResults[TAP_TO_PAY_ENTITLEMENT];
    }
    return mod;
  });
};
