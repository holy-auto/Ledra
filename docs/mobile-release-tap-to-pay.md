# Ledra モバイル iOS リリース手順 (Tap to Pay on iPhone)

このドキュメントは、`apps/mobile` (Expo / EAS Build) を iOS 公式リリースする際の
Tap to Pay on iPhone 用 entitlement (`com.apple.developer.proximity-reader.payment.acceptance`)
に関する手順とトラブルシューティングをまとめたものです。

## 0. 前提

- Bundle Identifier: `com.ledra.app`
- Apple Team ID: `T43978PBAA`
- ASC App ID: `6762254734`
- EAS Project ID: `82934b68-084f-45f0-8a4e-0abba3d124cd`
- Tap to Pay on iPhone は **Apple の事前承認 + App ID への明示的な capability 追加** が必要

## 1. Apple Developer Portal 側のチェックリスト

1. https://developer.apple.com/contact/request/tap-to-pay-on-iphone/ から
   **Tap to Pay on iPhone** の利用申請を行い、Apple の承認を受ける。
2. 承認後、Certificates, Identifiers & Profiles → **Identifiers** → `com.ledra.app` を開く。
3. Capabilities 一覧で **Tap to Pay on iPhone** にチェックを入れる。
4. **Save** ボタンを押す。
   - チェックを入れただけで Save しないと反映されないことがあるので注意。
   - 既にチェック済みでもエラーが続く場合は、一度 Edit → Save し直すと
     プロビジョニング側の整合性が更新されることがある。

## 2. EAS Build 側の手順

### 2.1. 古い provisioning profile を破棄

App ID に capability を追加した直後でも、EAS が以前に生成した
provisioning profile をキャッシュしているとそのまま使われ、
`com.apple.developer.proximity-reader.payment.acceptance` を含まない
profile でビルドが回ってしまう。

```bash
cd apps/mobile
npx eas-cli@latest credentials --platform ios
```

対話メニューで以下を実行する:

1. プロファイル `production` を選択
2. `Provisioning Profile: Manage everything needed to build your project`
3. `Remove provisioning profile`
4. その後 `Distribution Certificate` も合わせて再生成すると確実

### 2.2. クリーンビルド

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production --clear-cache
```

ビルドログで以下を確認:

- `Syncing capabilities` のステップに `proximity-reader.payment.acceptance` を含む行があること
- `Provisioning profile entitlements` に
  `com.apple.developer.proximity-reader.payment.acceptance` が含まれていること

### 2.3. ビルド後の検証

EAS Build 完了後、Artifact (`.ipa`) をダウンロードし、ローカルで以下を実行して
entitlement が埋め込まれているかを確認する:

```bash
unzip -p Ledra.ipa 'Payload/*.app/embedded.mobileprovision' \
  | security cms -D \
  | plutil -extract Entitlements xml1 -o - - \
  | grep proximity-reader
```

`com.apple.developer.proximity-reader.payment.acceptance` の行が出力されれば OK。

### 2.4. App Store Connect への submit

```bash
cd apps/mobile
npx eas-cli@latest submit --platform ios --profile production
```

`eas.json` の `submit.production.ios` に ASC API Key (`P235PU8K3S`) が
設定済みなので、追加の認証は不要。

## 3. よくあるエラーと対処

### 3.1. `Provisioning profile (...) doesn't include the com.apple.developer.proximity-reader.payment.acceptance entitlement`

| 原因 | 対処 |
|------|------|
| App ID で capability にチェックが入っていない | 1.3 を実施 |
| App ID で capability にチェックは入っているが Save していない | 1.4 を実施 |
| EAS が古い provisioning profile を再利用している | 2.1 → 2.2 を実施 |
| Apple 側の承認がまだ反映されていない | 承認メールから 24 時間程度待ってから再試行 |
| Apple 側で承認が「テスト用」のみ付与され、Distribution profile に含められない | Apple Developer Support に Technical Support Incident (TSI) を起票 |

### 3.2. `Entitlement com.apple.developer.proximity-reader.payment.acceptance has invalid value`

`app.json` の `ios.entitlements` で値が boolean (`true`) になっているかを確認。
文字列 `"true"` ではエラーになる。

```json
"entitlements": {
  "com.apple.developer.proximity-reader.payment.acceptance": true
}
```

### 3.3. ビルドは通るが実機で `Tap to Pay 接続失敗` になる

- iPhone XS 以降 / iOS 16.4 以降であること
- Apple ID で日本リージョンの Apple Pay が有効化されていること
- Stripe ダッシュボードで該当 Location が `tap_to_pay_eligible` になっていること

## 4. 参考リンク

- Apple: https://developer.apple.com/tap-to-pay-on-iphone/
- Apple フォーラム (entitlement 追加問題): https://developer.apple.com/forums/thread/740726
- Stripe Tap to Pay ドキュメント: https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay
- Stripe Terminal RN Issue #955 (capability 自動付与): https://github.com/stripe/stripe-terminal-react-native/issues/955
- Expo FYI (provisioning profile 不足): https://github.com/expo/fyi/blob/main/provisioning-profile-missing-capabilities.md
