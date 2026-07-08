# メール予約取り込み セットアップ手順書

予約メールを専用アドレスへ自動転送するだけで、AI が日程・車両・内容を読み取り、
確認付きで予約・Google カレンダーへ取り込む機能の構築・運用手順。

抽出→予約→カレンダーの中核は LINE 取り込みと同じ実装を再利用しており、本機能で
新しく必要になるのは「メールの受け取り口（Inbound Webhook）」と「テナント↔受信
アドレスのマッピング」だけ。

- 実装: `src/app/api/webhooks/inbound-email/route.ts` / `src/lib/email/inboundAddress.ts`
  / `src/lib/line/messageStore.ts`（`recordInboundEmailMessage`）
- 設定 UI/API: 管理画面「店舗設定 → メール予約取り込み」/ `src/app/api/admin/email-inbound/route.ts`
- 抽出/自動起票: `src/lib/ai/automation/inboundAuto.ts`（`channel:"email"`）

---

## 全体像

```
店舗の受信箱 (Gmail 等)
  └─ 予約メールを自動転送
        └─ yoyaku-<token>@<INBOUND_EMAIL_DOMAIN>
              └─ SendGrid Inbound Parse (MX 受信 → HTTP POST)
                    └─ POST /api/webhooks/inbound-email
                          ├─ token → tenant 解決 (tenants.email_inbound_token)
                          ├─ customer_messages(channel="email") に記録
                          └─ maybeAutoProcessInboundMessage(channel:"email")
                                └─ AI 抽出 → (opt-in) 予約自動起票 → Google カレンダー
```

方針は **転送方式 × SendGrid Inbound Parse**（既存ベンダー再利用・追加費用 0 円）。
店舗側の DNS 設定は不要で、設定は「転送を 1 回入れるだけ」。

---

## A. 一度だけ行う基盤設定（Ledra 運用者）

### A-1. 受信用サブドメインを決める

送信用ドメインと分離した専用サブドメインを用意する（例: `parse.ledra.app`）。
SPF/DKIM など送信系設定に影響しないよう、**MX 専用のサブドメイン**にするのが安全。

### A-2. SendGrid Inbound Parse を設定

1. SendGrid ダッシュボード → **Settings → Inbound Parse → Add Host & URL**
2. **Receiving Domain**: 上記サブドメイン（例: `parse.ledra.app`）
3. **Destination URL**:
   `https://<本番ホスト>/api/webhooks/inbound-email?key=<INBOUND_EMAIL_WEBHOOK_SECRET>`
   - `INBOUND_EMAIL_WEBHOOK_SECRET` を設定する場合は `?key=` に同じ値を付ける（未設定なら `?key=` は不要）
4. **POST the raw, full MIME message** は **OFF**（パース済みフィールドを使う実装のため）
5. 保存

### A-3. DNS に MX を追加

サブドメインの MX を SendGrid へ向ける（値は SendGrid の案内に従う。一般に）:

```
parse.ledra.app.  MX  10  mx.sendgrid.net.
```

反映確認:

```
dig MX parse.ledra.app +short
# → 10 mx.sendgrid.net.
```

### A-4. 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `INBOUND_EMAIL_DOMAIN` | ○ | 受信アドレスのドメイン（例: `parse.ledra.app`）。未設定だと管理画面でアドレスを発行できない |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | 任意 | 受信 Webhook の共有シークレット。設定すると `?key=` を定数時間比較で検証し、不一致は 401 |

`.env.example` にも記載済み。本番（Vercel）の環境変数にも設定してデプロイする。

### A-5. DB マイグレーション

`supabase/migrations/20260708000000_email_inbound.sql` を適用（`tenants.email_inbound_token` /
`email_inbound_enabled` を追加）。通常のデプロイ／マイグレーション手順に含まれる。

---

## B. テナント（店舗）ごとの設定

### B-1. 機能を有効化してアドレスを取得

1. 管理画面 → **店舗設定 → メール予約取り込み**
2. **「有効にする」** をクリック → 受信トークンが発行され、専用アドレスが表示される
   例: `yoyaku-3f9a…@parse.ledra.app`
3. 「コピー」でアドレスを控える

> `INBOUND_EMAIL_DOMAIN` が未設定の環境では、有効化してもアドレスは表示されず注意書きが出る（基盤設定 A-4 が先）。

### B-2. 店舗の受信箱で自動転送を設定（Gmail の例）

1. Gmail → **設定 → メール転送と POP/IMAP → 転送先アドレスを追加**
2. B-1 のアドレスを入力して追加
3. 確認メールが専用アドレス宛に届く → **Ledra 側で自動承認**（数分で有効化）
4. 予約サイト等からのメールだけを流したい場合は、Gmail の **フィルタ** で条件を付けて
   「転送する」を選ぶと確実

Outlook・独自ドメインメールでも「自動転送／リダイレクト」機能があれば同様に設定可能。

### B-3. AI 自動起票の前提（任意）

受信メールは必ず受信箱（`customer_messages`）に記録され、AI 抽出のドラフトが付く。
そこから**予約を自動起票**するには、LINE と同じく以下がすべて必要（既定は安全側 OFF）:

- テナントの AI 自動化設定で受信抽出を opt-in（`shouldAutoExtractInbound`）
- プランが Standard 以上（`ai_inbound_extract`）
- 顧客の自動作成は Pro プラン（`customer.auto_create`）

自動起票を使わない場合も、受信箱でドラフトを確認して手動で予約化できる。

---

## C. 動作確認

1. B の設定後、テスト用の予約文面メールを店舗受信箱に送る（例:「明日14時にプリウスの
   コーティング予約したいです。山田」）
2. 転送 → 数十秒以内に管理画面の顧客メッセージ（受信箱）に `email` チャネルで表示される
3. AI 抽出が opt-in なら、予約ドラフト or 自動起票（`【要確認】…`）が作られる
4. 予約が作られれば Google カレンダー連携が有効なテナントではカレンダーへ反映

ログ確認: サーバーログの `[inbound-email] processed`（送信元はマスク表示）。

---

## D. セキュリティ / 挙動メモ

- **テナント解決**: 宛先の token（128bit 乱数・DB 一意）で特定。`email_inbound_enabled=false`
  や無効テナント宛は **200 で握りつぶす**（バックスキャッタ・再送ループ防止）。
- **共有シークレット**: `INBOUND_EMAIL_WEBHOOK_SECRET` 設定時のみ `?key=` を検証。
- **冪等化**: `Message-ID`（無ければ本文ハッシュ）で `webhook_processed_events` に claim。
  重複配信はスキップ、claim 失敗時は 503 を返しプロバイダに再送させる。
- **プロンプトインジェクション対策**: 本文・会話履歴は `<受信本文>…</受信本文>` で囲んで
  データ扱い（既存 `wrapUntrusted`）。店舗返信（outbound）は文脈専用で、顧客情報の
  抽出元にしない。
- **複合認識**: 同一顧客スレッドの直近やり取りを文脈として渡す。相対日付（「明日」）は
  各発言の受信日基準で解釈。同一顧客・同一日の未キャンセル予約がある場合は自動起票を
  スキップ（二重予約防止）。

---

## E. トラブルシュート

| 症状 | 確認 |
| --- | --- |
| 受信箱に出てこない | `dig MX <domain>` が SendGrid を指すか / Inbound Parse の Destination URL / `?key=` の一致 |
| 401 が返る | `INBOUND_EMAIL_WEBHOOK_SECRET` と URL の `?key=` の不一致 |
| 「アドレスを発行できません」表示 | `INBOUND_EMAIL_DOMAIN` 未設定（A-4） |
| 記録はされるが予約が起票されない | 自動起票は opt-in + プラン条件（B-3）。未達なら受信箱ドラフトから手動化 |
| 別テナントに混ざる | token の一意制約により発生しない設計。手動で token を書き換えていないか確認 |

---

## 参考: 他プロバイダへの差し替え

受信 Webhook は multipart フォーム（`to` / `from` / `subject` / `text` / `html` /
`envelope` / `headers`）を前提にしている。Mailgun Routes / Cloudflare Email Workers 等へ
差し替える場合も、同じ形にマッピングして `POST /api/webhooks/inbound-email` に送れば、
**店舗側の導線（転送するだけ）は変わらない**。宛先アドレスの `envelope.to` か `to` に
`yoyaku-<token>@<INBOUND_EMAIL_DOMAIN>` が入っていれば tenant 解決は成立する。
