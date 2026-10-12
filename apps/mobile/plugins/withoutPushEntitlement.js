/**
 * LEDRA_IOS_PUSH=off のときだけ iOS の aps-environment entitlement を外す config plugin。
 *
 * 背景 (2026-10-12):
 *   EAS に保管されている App Store 用 provisioning profile
 *   （"[expo] com.ledra.app AppStore 2026-05-02..."）は expo-notifications 導入前に
 *   作られたもので Push Notifications capability を含まない。aps-environment が
 *   entitlements に入っていると production / TestFlight ビルドが署名段階で落ちる。
 *   profile の作り直しには Apple ID ログイン or ASC キーが要り、JMS2026 の
 *   デモ配布に間に合わないため、eas.json の "demo" プロファイルだけ push を外す。
 *
 *   push 登録の失敗は src/lib/push.ts で握りつぶされるので、アプリ動作には影響しない。
 *
 * 復帰手順（push 入りの本番ビルドを作るとき）:
 *   Apple Developer で App ID com.ledra.app の Push Notifications を有効化し、
 *   `eas credentials --platform ios` で App Store profile を削除→再生成する。
 *   その後は production プロファイル（LEDRA_IOS_PUSH 未設定）でそのままビルドできる。
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require -- Expo config plugins are loaded via CommonJS require()
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPushEntitlement(config) {
  if (process.env.LEDRA_IOS_PUSH !== "off") return config;
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
};
