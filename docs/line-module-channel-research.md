# LINE連携を「ログインだけ」にできるか — モジュールチャネル調査

作成日: 2026-08-16 / 更新: 2026-08-16（申請受付停止の判明と、その回避策の実装）

## 1行結論

**モジュールチャネルは技術的には可能だが、現在申請の受付が停止中のため採用できない。代わりに Messaging API で自動化できる工程をすべて Ledra 側に寄せ、加盟店の作業を 7手順 → 2値の貼り付けに削った（実装済み）。**

## 【2026-08-16 追記】申請受付が停止中 → 代替策を実装した

代表より「モジュールチャネルは今は受付を停止中らしい」との情報。**この経路は現時点で採用できない。**

そこで、申請が一切要らない Messaging API の公開エンドポイントだけで、加盟店の作業をどこまで削れるかを洗い直して実装した（`src/lib/line/provisioning.ts`）。

| 元の手順 | 変更後 |
| --- | --- |
| 1. LINE公式アカウント開設 | 変わらず（加盟店） |
| 2. Developers Console で Messaging API チャネル作成 | 変わらず（加盟店） |
| 3. Channel ID / Channel Secret をコピー | 変わらず（加盟店） |
| 4. **長期アクセストークンを発行してコピー** | **不要** — Ledra が `POST /v2/oauth/accessToken` で自動発行 |
| 5. 3つの値を貼り付け | **2つ**（ID と Secret のみ） |
| 6. **Webhook URL を Console に貼り戻す** | **不要** — Ledra が `PUT /v2/bot/channel/webhook/endpoint` で自動設定 |
| 7. 応答メッセージを OFF | **状態を自動検出**して、必要なときだけ1行で案内 |

加盟店に残るのは **「2値をコピーして貼る」だけ**。さらに `POST /v2/bot/channel/webhook/test` で実際に配送できるかを保存時に検証するので、「保存できたのにメッセージが届かない」を保存の瞬間に検出できる。

**残った手作業と、その理由:**

- **「Webhookの利用」トグルの ON**: LINE の API は Webhook の **URL** は `PUT` できるが、利用の ON/OFF は設定できない（`GET` が返す `active` は読み取り専用）。OFF のときだけ検出して1行案内を出す。
- **応答モードの切替**: `GET /v2/bot/info` の `chatMode` で状態は読めるが、変更する API は無い。`chat` のときだけ案内を出す。

**この変更で新たに生まれたリスクと対処:** 自動発行するトークンは **30日で失効する**（従来の手入力の長期トークンは無期限だった）。放置すると30日後に予約通知・リマインダー・書類送付が静かに全部止まるため、失効時刻を `tenants.line_channel_token_expires_at` に保存し、送信直前に期限が3日以内なら自動で再発行する（`src/lib/line/client.ts` の `getLineConfig`）。既存の手入力トークンで運用中のテナントは同カラムが NULL のままで、再発行の対象外（挙動が変わらない）。

以下は元の調査内容。モジュールチャネルの受付が再開したときの判断材料として残す。

## いま何が問題か

現在の Ledra の LINE 連携（`src/app/admin/settings/LineConnectSection.tsx`）は、加盟店に次の作業を求めている。

1. LINE公式アカウントを開設する
2. LINE Developers Console でプロバイダーを作り、Messaging API チャネルを作る
3. Channel ID・Channel Secret をコピーする
4. チャネルアクセストークン（長期）を発行してコピーする
5. 3つの値を Ledra の設定フォームに貼る
6. Ledra が表示する Webhook URL をコピーして Console に貼り戻し、「Webhookの利用」をONにする
7. 「応答メッセージ」をOFFにする

7 ステップのうち 6 つが LINE Developers Console 側の作業で、整備工場の現場担当者が単独で完了するのは難しい。導入のたびに Ledra 側のサポートが張り付く構造になっている。Square・freee・マネーフォワード・Googleカレンダー・Slack がすべて「自社アカウントでログインするだけ」で終わるのに対し、LINE だけがこの手順を残している。

## モジュールチャネルとは（確実 — 本調査で出典を確認）

- モジュールは、**LINE公式アカウントに「アタッチ（連携）」することで Messaging API を使った機能を追加する仕組み**で、「モジュールチャネル」という種類のチャネルとして提供される。
- アタッチには **LINE公式アカウント管理者の認可が必要**で、OAuth 2.0 の認可フローに従う。
- 管理者が認可URL `https://manager.line.biz/module/auth/v1/authorize` にクエリパラメータ付きでアクセスすることで、アタッチ処理が始まる。
- アタッチ時の認可リクエストでは、**scope クエリパラメータに `message:receive` の指定が必須**。
- アタッチ後、Messaging API を呼ぶときは Authorization ヘッダに**モジュールチャネルのチャネルアクセストークン**を指定する。使える Messaging API の範囲は、アタッチ時に許可されたスコープで決まる。

つまり **Ledra 側がモジュールチャネルを 1 つ持てば、加盟店は「LINE公式アカウントの管理者としてログインして許可する」だけで済む**。加盟店が Developers Console でチャネルを作る必要も、トークンを発行する必要も、Webhook URL を貼り戻す必要もなくなる。上の 7 ステップが実質 1 ステップになる。

## 何が障壁か（確実 — 本調査で出典を確認）

**モジュールチャネルは、申請を完了した法人ユーザーのみが利用できる限定機能。** 利用を希望する場合は、担当者に相談するか、LINEマーケットプレイスの問い合わせフォームから申請する。ドキュメント自体が `developers.line.biz/ja/docs/partner-docs/` 配下（=「法人向けオプション」のリファレンス）に置かれており、一般公開の Messaging API とは扱いが分かれている。

## まだ分かっていないこと（未検証）

以下は本調査では答えが出ていない。LINEヤフーへの問い合わせでしか確定しない。

1. 申請の**審査基準**（法人格・実績・導入社数・認定パートナー資格の要否）
2. **費用**の有無と金額
3. 申請から利用開始までの**期間**
4. 既に手動で連携済みの加盟店を**モジュールチャネルへ移行する手順**（再認可が必要か、既存の友だち・トーク履歴が維持されるか）
5. モジュールチャネルで使える Messaging API の**具体的なスコープ一覧**（Ledra が今使っているプッシュ送信・リッチメニュー・Webhook 受信がすべて賄えるか）

補足: 一次情報である `developers.line.biz` は、この作業環境のネットワークプロキシで遮断されており直接読めていない。上記「確実」の記述は検索結果に含まれる LINE Developers 公式ドキュメントの記述に基づく。**申請前に、必ず公式ドキュメントを直接開いて 1〜5 を確認すること。**

## 進めるなら次にやること（この順）

1. LINEヤフーの担当者、または LINEマーケットプレイスの問い合わせフォームからモジュールチャネルの利用可否を照会する（上記 1〜5 をそのまま質問にする）
2. 使えると分かった時点で、`src/lib/integrations/` の汎用 OAuth エンジンに `providers/line.ts` を足す。認可URL・トークンURL・スコープが分かれば **provider 定義 1 ファイルで載る設計になっている**（新しい API ルートも DB マイグレーションも不要）
3. 既存の手動連携テナントを移行するまでは、手動フォームを残して併存させる

## 使えなかった場合の次善策

申請が通らない、または条件が合わない場合でも、次で手数は減らせる（いずれも未実装・要判断）。

- **LIFF / LINEログインを使った半自動化**: Channel Secret とアクセストークンの入力は残るが、Webhook URL の貼り戻しは Ledra 側から案内を出して往復を減らす
- **導入代行**: Ledra 側で Developers Console 作業を代行する運用（現状の実質的な運用をそのまま制度化する）。技術的負債ではなく人的コストになる

## 出典

- [モジュールチャネルを連携（アタッチ）する | LINE Developers](https://developers.line.biz/ja/docs/partner-docs/module-technical-attach-channel/)
- [モジュールチャネルからMessaging APIを利用する | LINE Developers](https://developers.line.biz/ja/docs/partner-docs/module-technical-using-messaging-api/)
- [Module | LINE Developers](https://developers.line.biz/en/docs/partner-docs/module/)
- [Using the Messaging API from a module channel | LINE Developers](https://developers.line.biz/en/docs/partner-docs/module-technical-using-messaging-api/)
- [Options for corporate customers API reference | LINE Developers](https://developers.line.biz/en/reference/partner-docs/)
