# A/B 申込フォーム 項目一覧

---

## A. ブランド証明書 ライト 申込フォーム

### 画面URL
`/admin/template-options/gallery` → テンプレート選択 → Stripe決済

### フォーム項目

A はセルフサービスのため、申込フォームは最小限。テンプレート選択→決済→設定画面 の流れ。

| # | 項目名 | フィールド名 | 型 | 必須 | 説明 | バリデーション |
|---|---|---|---|:---:|---|---|
| 1 | 選択テンプレート | platform_template_id | UUID | ○ | ギャラリーから選択済み | 有効なplatform_templateのID |
| 2 | 店舗名 | company_name | text | ○ | tenants.nameから自動入力 | 1〜100文字 |
| 3 | メールアドレス | contact_email | email | ○ | tenants.contact_emailから自動入力 | メール形式 |
| 4 | 利用規約同意 | terms_agreed | boolean | ○ | チェックボックス | true必須 |

### 決済フロー
1. テンプレート選択
2. 上記フォーム確認（ほぼ自動入力済み）
3. 利用規約同意チェック
4. 「お支払いに進む（¥16,500 + 月額¥3,300/月）」ボタン
5. → Stripe Checkout（one_time ¥16,500 + recurring ¥3,300）
6. 決済完了 → `/admin/template-options/configure/[id]` にリダイレクト
7. 設定画面で ロゴ・配色・文言を入力

### 決済完了後に自動作成されるレコード
- `tenant_option_subscriptions`: status=active, option_type=preset
- `tenant_template_configs`: option_type=preset, status=draft
- `template_orders`: order_type=preset_setup, status=active（即完了）

---

## B. ブランド証明書 プレミアム 申込フォーム

### 画面URL
`/admin/template-options/order`

### フォーム項目

| # | セクション | 項目名 | フィールド名 | 型 | 必須 | 説明 | バリデーション |
|---|---|---|---|---|:---:|---|---|
| | **基本情報** | | | | | | |
| 1 | 基本情報 | 店舗名 | company_name | text | ○ | tenants.nameから自動入力、編集可 | 1〜100文字 |
| 2 | 基本情報 | 正式名称 | company_formal_name | text | - | 証明書に記載する正式名称（株式会社○○等） | 最大100文字 |
| 3 | 基本情報 | 住所 | company_address | text | - | tenants.addressから自動入力 | 最大200文字 |
| 4 | 基本情報 | 電話番号 | company_phone | tel | - | tenants.contact_phoneから自動入力 | 電話番号形式 |
| 5 | 基本情報 | メールアドレス | contact_email | email | ○ | tenants.contact_emailから自動入力 | メール形式 |
| 6 | 基本情報 | 担当者名 | contact_person | text | ○ | 制作連絡先の担当者 | 1〜50文字 |
| | **ブランド情報** | | | | | | |
| 7 | ブランド | ロゴデータ | logo_file | file | ○ | PNG/SVG/JPG/AI形式 | 最大10MB, 指定拡張子 |
| 8 | ブランド | ブランドガイド | brand_guide_file | file | - | PDF/PNG/JPG形式 | 最大20MB |
| 9 | ブランド | メインカラー | primary_color | color | - | HEXコード or カラーピッカー | #RRGGBB形式 |
| 10 | ブランド | サブカラー | secondary_color | color | - | HEXコード or カラーピッカー | #RRGGBB形式 |
| 11 | ブランド | アクセントカラー | accent_color | color | - | HEXコード or カラーピッカー | #RRGGBB形式 |
| 12 | ブランド | 参考URL | reference_url | url | - | 参考にしたいデザインのURL | URL形式, 最大500文字 |
| 13 | ブランド | 参考画像 | reference_files | file[] | - | 参考にしたいデザインの画像 | 最大5件, 各10MB |
| | **証明書内容** | | | | | | |
| 14 | 内容 | 証明書タイトル | certificate_title | text | - | デフォルト「施工証明書」。変更したい場合に入力 | 最大30文字 |
| 15 | 内容 | 保証文言 | warranty_text | textarea | - | 証明書に記載する保証文言 | 最大500文字 |
| 16 | 内容 | 注意文言 | notice_text | textarea | - | 証明書に記載する注意文言 | 最大500文字 |
| 17 | 内容 | 追加したい項目 | additional_items | textarea | - | 標準項目以外に追加したい情報 | 最大1000文字 |
| 18 | 内容 | 証明書に載せたくない項目 | exclude_items | textarea | - | 非表示にしたい項目（必須項目は除外不可） | 最大500文字 |
| | **メンテナンス案内** | | | | | | |
| 19 | メンテ | メンテナンスURL | maintenance_url | url | - | メンテナンス案内ページのURL | URL形式 |
| 20 | メンテ | メンテナンスラベル | maintenance_label | text | - | QR下に表示するテキスト | 最大50文字 |
| 21 | メンテ | QRコード表示 | show_maintenance_qr | boolean | - | メンテナンスURLのQRを表示するか | |
| | **ご要望** | | | | | | |
| 22 | 要望 | デザインのご要望 | design_requests | textarea | - | 自由記述。雰囲気・テイスト等 | 最大2000文字 |
| 23 | 要望 | 参考にしたい証明書 | reference_certificates | textarea | - | 他社証明書等の参考情報 | 最大1000文字 |
| 24 | 要望 | 発行頻度の目安 | estimated_volume | select | - | 月間の証明書発行数目安 | 1-10/11-30/31-100/101+ |
| | **同意事項** | | | | | | |
| 25 | 同意 | 利用規約同意 | terms_agreed | boolean | ○ | チェックボックス | true必須 |
| 26 | 同意 | 注意事項確認 | notices_agreed | boolean | ○ | 「弁護士レビュー不含」等の確認 | true必須 |

### 入力補助テキスト

| フィールド | 補助テキスト |
|---|---|
| logo_file | PNG・SVG・JPG形式に対応。印刷品質を確保するため、300dpi以上を推奨します。AIデータがある場合はそちらをご提出ください。 |
| primary_color | ブランドのメインカラーです。不明な場合は空欄でも構いません。ロゴから推定いたします。 |
| warranty_text | 証明書に記載する保証条件です。例:「本施工に対し、施工日より○年間の品質保証をいたします。」 |
| notice_text | 注意事項・免責事項を記載します。例:「経年劣化・事故による損傷は保証対象外です。」 |
| design_requests | 「高級感のある黒ベース」「シンプルで清潔感のある白」など、ご希望のイメージをお書きください。 |
| maintenance_url | お客様がQRコードを読み取った際に表示されるページのURLです。メンテナンス時期・内容の案内ページを推奨します。 |
| reference_url | 「こんな雰囲気にしたい」という参考サイトやデザインのURLがあればご記入ください。 |

### 決済フロー
1. 上記フォーム入力
2. 入力内容確認画面
3. 利用規約・注意事項同意チェック
4. 「お支払いに進む（¥88,000）」ボタン
5. → Stripe Checkout（one_time ¥88,000）
   ※ 月額（¥4,400/月）は制作完了・公開時に別途Stripe Subscriptionを作成
6. 決済完了 → `/admin/template-options/order/[orderId]` にリダイレクト
7. ステータス: `paid` → CARTRUST運営にSlack/メール通知

### 決済完了後に自動作成されるレコード
- `template_orders`: order_type=custom_production, status=paid
- `template_assets`: logo_file等のアップロード済み素材
- `template_order_logs`: action=payment_received

### B の月額課金開始タイミング
- 制作完了 → テナント承認 → 公開 のタイミングで月額サブスク作成
- 管理者がA3画面でステータスを `active` に変更した際に:
  1. `tenant_option_subscriptions` を作成（status=active）
  2. Stripe Subscription を作成（recurring ¥4,400/月）
  3. `tenant_template_configs` の status を `active` に更新

---

## 追加作業依頼フォーム

### 画面URL
`/admin/template-options/order?type=modification`

### フォーム項目

| # | 項目名 | フィールド名 | 型 | 必須 | 説明 |
|---|---|---|---|:---:|---|
| 1 | 作業種別 | order_type | select | ○ | 文言修正 / レイアウト調整 / QR・URL差し替え / テンプレート追加制作 / 大幅再設計 |
| 2 | 対象テンプレート | template_config_id | select | ○ | 利用中テンプレートから選択 |
| 3 | 変更内容の詳細 | description | textarea | ○ | 具体的な変更内容を記述 |
| 4 | 参考素材 | files | file[] | - | 変更に必要な素材（ロゴ差替等） |
| 5 | 希望納期 | preferred_due_date | date | - | 希望する完了日 |

### 追加作業の決済
- フォーム送信 → CARTRUST運営が見積 → Stripe Invoice発行 → テナントが支払い → 着手
- 見積金額は管理者がA3画面で設定 → Stripe Invoice APIで請求
