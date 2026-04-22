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
const { withEntitlementsPlist } = require("expo/config-plugins");

const TAP_TO_PAY_ENTITLEMENT =
  "com.apple.developer.proximity-reader.payment.acceptance";

module.exports = function withRemoveTapToPayEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    if (mod.modResults && TAP_TO_PAY_ENTITLEMENT in mod.modResults) {
      delete mod.modResults[TAP_TO_PAY_ENTITLEMENT];
    }
    return mod;
  });
};
