# LINE連携を「ログインだけ」にできるか — モジュールチャネル調査

作成日: 2026-08-16 / 調査のみ（実装なし）

## 1行結論

**技術的には可能。ただし LINEヤフーへの申請・承認が前提の法人限定機能なので、実装より先に事業判断（申請するかどうか）が要る。**

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
