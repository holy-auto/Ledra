/**
 * @stripe/stripe-terminal-react-native (beta.29) が prebuild 時に
 * com.apple.developer.proximity-reader.payment.acceptance entitlement を
 * 自動注入するが、Apple 側の承認が Distribution profile に反映されるまでは
 * ビルドエラーになるため、このプラグインで強制的に除去する。
 *
 * Apple の承認が完了したら、このプラグインを plugins 配列から外し、
 * app.json の ios.entitlements に entitlement を再追加すること。
 */
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withRemoveTapToPayEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults[
      "com.apple.developer.proximity-reader.payment.acceptance"
    ];
    return mod;
  });
};
