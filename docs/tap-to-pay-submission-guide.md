# Tap to Pay on iPhone - Distribution 提出ガイド

> **2026-08 更新（配布方針の変更）**: 配布チャネルを **Custom Apps → App Store 一般公開** に変更した（代表判断: 毎回の手動配布運用を避け、誰でもDL可能にする）。
> これに伴い Apple 審査要件 **2.x（アプリ内オンボーディング）・3.2/3.3/3.4・6.x が「N/A」から「必須」に変わる**。
> 該当実装（アプリ内サインアップ / アカウント削除 / push基盤 / ホームバナー）は
> PR `claude/ledra-tap-to-pay-strategy-v08fcp` で対応済み。旧 Custom Apps 前提の記述は本更新で置き換えた。

## 提出物 (Apple へメール返信時)

1. **動画3本**:
   - Onboarding flow video（アプリ内サインアップ〜利用開始）
   - Enabling Tap to Pay & Educating Merchants video
   - Checkout flow video
2. **App Review Requirements Checklist** (記入済み Numbers ファイル)

すべて Apple のFile Uploader にアップロードしてからメール返信。

---

## 動画撮影前の準備

### 1. テスト用 iPhone を用意
- iPhone XS 以降
- iOS 16.4 以降（推奨: 17 以降）
- Apple Developer 登録済みデバイス
- Apple Account でサインイン済み
- Tap to Pay 用 Apple Account 規約は未承諾の状態

### 2. テスト環境
- Stripe **テストモード** で発行された Connect アカウントとPSPテスト鍵
- ビルドは `eas build --profile development` (Development Distribution Entitlement で署名されたビルド)
- **テスト用の新規メールアドレス**（動画1のサインアップ実演用。使い捨て可）

### 3. 録画準備
- **画面録画ツール**: コントロールセンターの画面収録 + マイクON
- **チェックアウト動画専用**: Tap to Pay UI は OS 側で画面収録がブロックされるため、**別iPhone or 三脚 + カメラ** で iPhone を物理的に撮影する必要あり

---

## 動画1: Onboarding Flow (新規ユーザー / アプリ内サインアップ)

App Store 一般公開のため、**アプリ内で新規アカウント作成 → 利用開始までが完結**することを示す（要件 2.1 / 2.2）。目標は平均15分以内（要件 2.3）。

```
[画面収録]
1. App Store から Ledra をインストール（or TestFlight）
2. 初回起動 → ログイン画面
3. 「新規登録（施工店の方）はこちら」をタップ
4. サインアップ画面で入力:
   - 店舗名（必須）
   - お名前（任意）
   - メールアドレス（必須）
   - パスワード（8文字以上）
   - 電話番号（任意）
5. 「登録して始める」をタップ
   ↓
   /api/signup がテナント + owner ユーザーを作成し、そのまま自動サインイン
6. メール確認（OTP）画面 → 届いた6桁コードを入力（#1012 で実配線済み）
7. 店舗選択画面 → 新規テナントは必ず0店舗なので「続行する」をタップ
   （/api/signup は auth.users / tenants / tenant_memberships の3つしか作らない）
   → 生体認証の設定 → オンボーディング → ホーム画面が表示される（=利用開始）
8. ホームの「iPhone でカード決済（Tap to Pay）」をタップ
   → Tap to Pay 設定へ（動画2へ続く導線を示す。要件 3.1 / 3.4）
```

提出時のラベル: `01_onboarding_signup.mp4`

> メモ: アカウント削除導線（要件対応・Apple 5.1.1(v)）は 設定 → 「アカウントを削除」。
> 審査で問われたら実演できるようにしておく（削除は不可逆なので本番アカウントでは実行しない）。

---

## 動画2: Enabling Tap to Pay + Educating Merchants

### シナリオ (ログイン済みユーザー)

**準備**: アプリにログイン済み、Tap to Pay は未有効化の状態。

```
1. アプリ起動 → ホーム画面表示
2. ホームの Tap to Pay 有効化バナーを写す（要件 3.1）
3. バナー もしくは 下タブ「その他」→「設定」→「Tap to Pay 設定」をタップ
   ↓
   要件 3.6 を満たす：通常フロー外 (設定画面) からアクセス可能
4. Tap to Pay 設定画面が表示される
   - iPhone のタッチ決済の説明カード
   - 受け付けられる支払方法 (コンタクトレスカード/Apple Pay/その他電子ウォレット)
   ↓
   要件 4.3 を満たす：設定/ヘルプから教育コンテンツへアクセス可能
5. 「Tap to Pay を有効化する」ボタンをタップ
   ↓
   要件 3.5 を満たす：T&C同意の明確なアクション
6. Apple の Tap to Pay 利用規約画面が iOS 標準UIで表示される
7. 「同意して続ける」をタップ
8. 設定進捗インジケータが表示される (0% → 100%)
   ↓
   要件 3.9.1 を満たす：configurationProgress による進捗表示
9. 完了通知が表示される
10. 設定画面に戻り「✅ 有効化済みです」表示を確認
11. [別途] 非adminユーザーで設定画面を開くと「管理者のみが行えます」案内が表示
   ↓
   要件 3.8 / 3.8.1 を満たす
```

提出時のラベル: `02_enabling_education.mp4`

---

## 動画3: Checkout Flow

### 重要
Tap to Pay UI は **画面録画でブラック表示** される (Apple の仕様)。
**外部カメラで iPhone を物理撮影**してください。
三脚 + 別スマホ or デジカメで iPhone 全体が映るように撮影する。

### 準備
- ログイン済み
- Tap to Pay 有効化済み
- Stripe テストカード or Apple Pay (テスト用) を用意

### シナリオ
```
1. ホーム画面から「予約」タブ → テスト予約をタップ
2. もしくは「会計」タブ → 「新規会計（飛び込み）」を選択
   （2026-09-03: 飛び込み側にも専用 Tap to Pay ボタンを追加したので、どちらの経路でも
     要件 5.1/5.2/5.5 を満たす。以前は飛び込みに専用ボタンが無く撮影に使えなかった）
3. メニュー (例: コーティング ¥10,000) を追加し合計を表示
4. ★ チェックアウト画面で 専用 Tap to Pay ボタンが**最上位**に表示されるのを写す
   ↓
   要件 5.1, 5.2, 5.5 を満たす (専用ボタン / 最上位 / SF Symbols 同等アイコン)
5. ボタン文言が「iPhone のタッチ決済」と日本語表示されるのを写す
   ↓
   要件 5.4 を満たす
6. ボタンをタップ → 1秒以内に Apple Tap to Pay UI が立ち上がるのを写す
   ↓
   要件 5.6 を満たす
7. (もし設定中なら) "initializing" 画面が表示されるのを写す
   ↓
   要件 5.7 を満たす
8. iPhone 上部に コンタクトレスカード / Apple Pay デバイスをかざす
   ↓
   外部カメラで iPhone とカードの両方が映るアングルにする
9. 読取後 "processing" 画面が表示されるのを写す
   ↓
   要件 5.8 を満たす
10. 承認画面（または拒否画面）が明示的に表示されるのを写す
    ↓
    要件 5.9 を満たす
11. レシート送信ダイアログを開いて SMS または Email でレシートを送信
    ↓
    要件 5.10 を満たす
```

提出時のラベル: `03_checkout.mp4`

---

## チェックリスト記入対応表

`App Review Requirements Checklist 1_6.numbers` の各項目を以下と対応させて記入：

| Sec | # | 状態 | 備考 |
|----|---|------|------|
| 1 | 1.1 | ✅ Completed | UIRequiredDeviceCapabilities = arm64 + iphone-ipad-minimum-performance-a12 |
| 1 | 1.2 | ✅ Completed | iOS Deployment Target = 16.0 (Stripe Terminal SDK 要件に準拠) |
| 1 | 1.3 | ✅ Completed | 同上 |
| 1 | 1.4 | ✅ Completed | useTerminal で OS_VERSION_NOT_SUPPORTED 専用ハンドリング |
| 1 | 1.5 | ✅ Completed | useTapToPayWarmup でアプリ起動時 + foreground 復帰時に warmup |
| 1 | 1.6 | ⚠️ 要確認 | **checkout はローカル T&C フラグでゲートしない（要件遵守）**。ただし termsAccepted は接続成功から派生した表示専用フラグ。Stripe Terminal SDK が Apple 保存の T&C 状態を直接返す API を持つか **提出前に確認**（無ければ「接続成功=同意済み」の現方針を明記して回答） |
| 1 | 1.7 | ⚠️ Optional | FaceID/TouchID は未実装（推奨項目のため非ブロッカー） |
| 1 | 1.8 | ✅ Completed | HIG 準拠 (SF Symbols 同等アイコン、iOS Native Stack 利用) |
| 1 | 1.9 | ⚠️ 要対応 | App Store 公開のためマーケティングガイドライン準拠が必要（ロゴ・文言はリリース後にAppleガイドラインで点検） |
| 2 | 2.1 | ✅ Completed | (auth)/signup.tsx でアプリ内サインアップ（テナント+owner作成→自動サインイン） |
| 2 | 2.2 | ✅ Completed | 完全アプリ内デジタルオンボーディング（Web遷移なし） |
| 2 | 2.3 | ⚠️ 要計測 | 平均15分以内。実機で所要時間を計測して記入 |
| 3 | 3.1 | ✅ Completed | ホームの「iPhone でカード決済（Tap to Pay）」導線 + 設定 → Tap to Pay 設定。**閉じられない常設**にしている（閉じられると要件を満たさない時間帯ができるため） |
| 3 | 3.2 | ⚠️ 未実装 | 初回起動の全画面スプラッシュ告知は未実装（リリース時告知として後追い可。審査ブロッカーか要確認） |
| 3 | 3.3 | ⚠️ 基盤のみ | push トークン収集（expo-notifications → /api/mobile/push/register）は実装済み。実際の一斉配信送出はリリース運用時に実施 |
| 3 | 3.4 | ✅ Completed | サインアップ完了後ホームの常設導線で TTP 有効化方法を提示 |
| 3 | 3.5 | ✅ Completed | 設定画面の「Tap to Pay を有効化する」ボタン |
| 3 | 3.6 | ✅ Completed | 設定画面から有効化可能 |
| 3 | 3.7 | ✅ Completed | チェックアウトの TTP ボタン押下で connectTapToPay 起動 |
| 3 | 3.8 | ✅ Completed | hasMinRole('admin') による制御 |
| 3 | 3.8.1 | ✅ Completed | 非adminには管理者連絡を促す UI |
| 3 | 3.8.2 | N/A | Apple Account 経由で T&C 同意するため対象外 |
| 3 | 3.9 | ⚠️ Optional | 「試してみる」画面は未実装（推奨項目） |
| 3 | 3.9.1 | ✅ Completed | onDidReportReaderSoftwareUpdateProgress + ProgressBar |
| 4 | 4.1 | ⚠️ 要確認 | Stripe Terminal SDK が ProximityReaderDiscovery を内部使用しているか **提出前に確認**。SDK 依存の方針 |
| 4 | 4.2 | ✅ Completed | 設定画面 Tap to Pay 設定の「使い方」セクション |
| 4 | 4.3 | ✅ Completed | 同上 |
| 4 | 4.4-4.8 | ⚠️ 要確認 | 4.1 で SDK が対応していれば充足。教育コンテンツの網羅性を点検 |
| 5 | 5.1 | ✅ Completed | TapToPayButton コンポーネント |
| 5 | 5.2 | ✅ Completed | 明細カード直後・支払方法より上に配置。**予約会計と飛び込み会計の両方**（2026-09-03 に飛び込み側を追加） |
| 5 | 5.3 | ✅ Completed | グレーアウトせず常時押下可能 |
| 5 | 5.4 | ✅ Completed | 「iPhone のタッチ決済」(日本語ロケール) |
| 5 | 5.5 | ✅ Completed | wave.3.right.circle 同等アイコンを SVG で再現 |
| 5 | 5.6 | ✅ Completed | useTapToPayWarmup により起動時から準備済み |
| 5 | 5.7 | ✅ Completed | 既存 isProcessing UI を流用 |
| 5 | 5.8 | ✅ Completed | TapToPayButton state="processing" |
| 5 | 5.9 | ✅ Completed | 会計画面のインライン UI（`pos/checkout/[id].tsx` の「タッチ決済ができませんでした」等）。**`components/PaymentOutcome.tsx` はどこからも import されていないデッドコードなので、この行の根拠ではない**（2026-09-03 に確認） |
| 5 | 5.10 | ✅ Completed | ReceiptShareDialog (SMS/Email/Share Sheet)。**予約レシートと飛び込みレシートの両方**（2026-09-03 に `receipt-standalone` へ追加） |
| 5 | 5.11 | N/A | 日本市場のため PIN 入力 / Fallback 不要 |
| 6 | 6.1 | ⚠️ リリース時 | 対象ユーザーへ専用メール（リリース運用） |
| 6 | 6.2 | ⚠️ 未実装 | 3.2 と兼ねる（リリース時スプラッシュ） |
| 6 | 6.3 | ⚠️ 基盤のみ | 3.3 の push 基盤を用いてリリース時に配信 |

---

## App Store Connect 提出メタデータ（C-3）

App Store 一般公開に必要（コード外・ASC 画面で設定）:

- [ ] アプリ名 / サブタイトル / 説明文 / キーワード / プロモーションテキスト
- [ ] スクリーンショット（6.7"・6.5"・5.5" 各必須サイズ、iPad 対応なら iPad も）
- [ ] **プライバシーポリシー URL**（必須）
- [ ] **サポート URL**（必須）
- [ ] App Privacy「収集データ」申告（連絡先: メール/氏名/電話、位置情報、写真、支払い情報、識別子）
      ※ アプリ側の `PrivacyInfo`（Required Reason API）は app.json `ios.privacyManifests` に実装済み
- [ ] 年齢レーティング（アンケート回答）
- [ ] 輸出コンプライアンス（`ITSAppUsesNonExemptEncryption: false` 設定済み → 追加書類不要）
- [ ] カテゴリ（ビジネス / 仕事効率化 等）

## App Review 用デモアカウント（C-4）

審査は認証必須アプリのためログイン情報が必要。ASC の「App Review 情報」に記載:

- [ ] 審査用テナントを1つ用意（本番 or ステージング）し、owner ロールのメール/パスワードを記載
- [ ] Tap to Pay を実演できるよう、Stripe の該当 Location を `tap_to_pay_eligible` にしておく
- [ ] デモ用の予約/会計データを1件仕込んでおく（チェックアウトを審査員が試せるように）
- [ ] 備考欄に「Tap to Pay は実機 iPhone XS 以降 + 実店舗 Location が必要」と明記

---

## 返信メールテンプレート（App Store 公開版）

```
Subject: Re: Tap to Pay on iPhone Publishing Entitlement Submission - com.ledra.app

Hello Apple Developer Support,

Thank you for granting the Development Distribution Entitlement for our app
"Ledra" (Bundle ID: com.ledra.app, Apple Team ID: T43978PBAA).

We have built our app to meet the requirements outlined in
"Tap to Pay on iPhone App & Marketing Requirements and Review Guide v1.6"
and would like to request the Publishing Entitlement.

We distribute this app publicly on the App Store. New merchants can create an
account and complete onboarding entirely in-app (see video 1), and can delete
their account from within the app (Settings > Delete Account).

We have uploaded the following materials to the File Uploader:

1. 01_onboarding_signup.mp4
   - In-app account creation and onboarding to first use
2. 02_enabling_education.mp4
   - Enabling Tap to Pay from Settings, accepting terms, merchant education
3. 03_checkout.mp4
   - Filmed externally to capture the Tap to Pay on iPhone UI;
     shows item entry -> checkout -> tap -> processing -> outcome -> receipt
4. App_Review_Requirements_Checklist_1_6_completed.numbers

PSP: Stripe (approved PSP for JP region)
Region: Japan

Please let us know if you need any additional information.

Best regards,
HOLY Corp. (Company)
```

---

## 動画撮影チェックリスト

撮影前に以下を確認：

- [ ] Stripe テストモードで動作するビルドを使う（development profile）
- [ ] iPhone XS 以降のテスト機を Apple Developer Portal に登録済み
- [ ] iOS 16.4 以降にアップデート済み
- [ ] 画面の通知が映らないように「おやすみモード」ON
- [ ] 動画1用に使い捨てメールアドレスを用意（サインアップ実演）
- [ ] 動画解像度: 1080p以上、30fps以上
- [ ] 音声: 不要（ナレーション無くてOK、画面で完結する）
- [ ] 手ぶれ防止: 三脚またはスタビライザー使用
- [ ] チェックアウト動画は **iPhone を物理撮影** すること（OS が画面録画をブロックする）

---

## 提出前 Go/No-Go（ビルド署名）

- [ ] **A-1**: Apple Developer Portal で `com.ledra.app` の Provisioning Support が
      `Development, Distribution` になっているか確認。
- [ ] `Distribution` 未付与なら production ビルドは entitlement 署名で失敗する。
      その場合は `apps/mobile/plugins/withRemoveTapToPayEntitlement` を app.json の
      plugins に一時的に戻し、TTP無しで先行公開 → 承認後に外す運用に切替
      （手順は `docs/mobile-release-tap-to-pay.md`）。
- [ ] `Distribution` 付与済みなら現状の app.json のまま production ビルド可。
```
