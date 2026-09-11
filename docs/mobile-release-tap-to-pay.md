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
| **`development-device` に Ad Hoc / App Store のプロファイルを置いている**（`credentialsSource: "local"` + `credentials.json`） | **Development 型（iOS App Development）のプロファイルに差し替える。** Ad Hoc は Distribution 型なので、承認が Development 限定の間は何度作り直しても entitlement は入らない（MISTAKE_LEDGER M-085） |

### 3.1.1. 手元のプロファイルが Development 型か Distribution 型かを判定する

`credentialsSource: "local"` を使う `development-device` では、
`credentials/ios/profile.mobileprovision` が **Development 型**である必要がある。
Windows (PowerShell) での判定:

```powershell
$f = "apps\mobile\credentials\ios\profile.mobileprovision"
$t = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($f))
$s = $t.IndexOf('<?xml'); $e = $t.IndexOf('</plist>') + 8
$x = $t.Substring($s, $e - $s)
if ($x -match 'get-task-allow</key>\s*<true/>') { "Development 型 (OK)" } else { "Distribution 型 (Ad Hoc/App Store) — このままでは通らない" }
if ($x -match 'proximity-reader') { "entitlement あり" } else { "entitlement なし" }
```

macOS では `security cms -D -i profile.mobileprovision | plutil -p -` でも同じことが分かる。

### 3.1.2. Development 型プロファイルを用意する（Windows / macOS 共通）

**保管場所**: 実績のある置き場は `apps/mobile/ttp-creds/`（`.gitignore` 済み）。
`eas credentials` の「Download credentials from EAS to credentials.json」を実行すると
`credentials.json` が **EAS 側の Ad Hoc 資格情報と `credentials/ios/` パスで上書きされる**
ため、TTP 用の Development 資格情報を使いたいときにこれを実行してはいけない。

**なぜ手作業が要るか**: EAS Build の internal distribution は `developmentClient: true`
でも **Ad Hoc（Distribution 型）** の provisioning profile を生成する
（https://docs.expo.dev/build/internal-distribution/ ）。Apple の TTP 承認が
Development 限定の間は、EAS に作らせたプロファイルでは必ず失敗する。
`eas.json` で `development-device` にだけ `credentialsSource: "local"` が
付いているのはこのため。**EAS には作れない Development 型を手元から渡している。**

必要なものは2つ。**Apple Development 証明書**（Distribution ではない）と、
それに紐づく **iOS App Development** プロファイル。

#### 1) Apple Development 証明書を作る

既に持っている場合はこの手順を飛ばす。Windows は Git Bash 等の `openssl` を使う。

```bash
openssl genrsa -out ios_dev.key 2048
openssl req -new -key ios_dev.key -out ios_dev.csr \
  -subj "/emailAddress=<Apple ID のメール>/CN=HOLY Corp./C=JP"
```

Apple Developer Portal → Certificates → `+` → **Apple Development** を選び、
`ios_dev.csr` をアップロードして `development.cer` をダウンロード。`.p12` に変換:

```bash
openssl x509 -inform DER -in development.cer -out development.pem
openssl pkcs12 -export -inkey ios_dev.key -in development.pem \
  -out dist-cert.p12 -passout pass:<任意のパスワード>
```

`apps/mobile/credentials/ios/dist-cert.p12` に置き、`credentials.json` の
`distributionCertificate.password` を合わせる
（キー名は `distributionCertificate` だが Development 証明書でよい）。

#### 2) iOS App Development プロファイルを作る

Apple Developer Portal → Profiles → `+` → **iOS App Development**
（**Ad Hoc を選ばない**。Ad Hoc は Distribution 型で TTP entitlement が入らない）。

1. App ID: `com.ledra.app`
2. Certificates: 上で作った **Apple Development** 証明書
3. Devices: 実機の UDID にチェック
4. Generate → ダウンロードし
   `apps/mobile/credentials/ios/profile.mobileprovision` として保存

#### 3) 確認してからビルド

§3.1.1 の判定コマンドで **「Development 型 (OK)」「entitlement あり」** の両方が
出ることを確認してから実行する。ここで確認せずにビルドを回すと、20分待って
同じエラーを見ることになる（MISTAKE_LEDGER M-085）。

```bash
cd apps/mobile
npx eas-cli build --profile development-device --platform ios
```

ビルドログで `export_options.method` が `development` になっていれば正しい。
`ad-hoc` なら渡したプロファイルが Distribution 型のまま。

> **秘密情報の扱い**: `credentials/` と `credentials.json` は秘密鍵とパスワードを
> 含む。`.gitignore` 済みであることを確認し、コミット・チャット・issue に
> 貼らないこと。

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
