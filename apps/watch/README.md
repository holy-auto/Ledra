# Ledra for Apple Watch

店舗スタッフ向けの watchOS MVP。管理画面を縮小表示せず、当日の作業確認と工程を進める操作だけに絞る。Watchアプリ本体はwatchOS 10以降、Live ActivityのSmart Stack表示はwatchOS 11以降を対象とする。

## MVP

- 当日の予約と、前日以前から継続中の作業を表示
- 作業中 → 来店済み → 予約済みの順で優先表示
- 車両ナンバー、車種、顧客、現在工程、進捗を確認
- お客様の来店通知（iPhoneへのプッシュ通知をApple Watchへ転送）
- 工程予定時刻を超えたときのApple Watch通知
- 音声入力を使った短い作業メモ
- 「来店受付」「作業開始」「次の工程へ」「作業完了」を1タップで実行
- 「写真を撮る」からiPhoneの撮影画面へ連携
- 作業中はiPhoneのLive Activityを開始し、接続中のApple WatchのSmart Stackにも進捗を表示
- 撮影前に「施工前／作業中／施工後」をWatchで選択し、iPhoneの撮影画面へ引き継ぐ
- 写真アップロードの成功／失敗をWatchへ返し、振動とメッセージで確認
- Siri／ショートカットから「工程を進める」「現在の作業にメモ」を実行
- 最終操作だけ確認ダイアログを表示
- オフライン時は直前の一覧を表示し、操作は送信せず再試行を案内

証明書作成、会計、車両登録は iPhone アプリへ引き継ぐ。Apple Watch 上で長い入力は行わない。文字盤の「作業中2件」コンプリケーションは今回のMVPには含めていない。

「写真を撮る」はiPhoneでLedraが開いている場合は撮影画面へ直接移動する。iPhoneがロック中またはバックグラウンドの場合は通知を出し、タップすると撮影画面を開く。

## 構成

- `LedraWatchApp/`: watchOS 10+ の SwiftUI ソース
- `apps/mobile/modules/ledra-watch-bridge`: iOS 側から認証情報を渡す Expo native module
- `LedraLiveActivity/`: iPhoneのロック画面、Dynamic Island、WatchのSmart Stack向けLive Activity
- Web API: `GET /api/mobile/watch/today`
- 工程更新: 既存 `POST /api/mobile/reservations/{id}/advance`

## Xcode への組み込み

このリポジトリは Expo Continuous Native Generation を使い、`ios/` をコミットしていない。watchOS ターゲットは macOS の Xcode で次の手順で追加する。

1. `apps/mobile` で iOS ネイティブプロジェクトを生成する。
2. Xcode の **File > New > Target > watchOS App** で `LedraWatch` を追加する。
3. bundle identifier を `com.ledra.app.watchkitapp`、Companion App を `com.ledra.app` にする。
4. `LedraWatchApp/` の Swift ファイルを Watch ターゲットへ追加する。
5. iOS側の `ledra-watch-bridge` は Expo autolinking で組み込まれることを確認する。
6. **Widget Extension** を追加し、`LedraLiveActivity/LedraWorkLiveActivity.swift` をターゲットへ追加する。
7. Widget Extensionには `LedraWatchBridge/ActivityShared` サブスペックだけをリンクし、共有の `LedraWorkActivityAttributes` を参照できるようにする。
8. 実機の iPhone と Apple Watch の組み合わせで認証同期、Live Activity、バックグラウンド転送、工程更新、撮影結果の振動を確認する。

watchOS ターゲットの自動生成は Expo の config plugin で追加できるが、Xcode project の変更を伴うため、まず実機MVPを確認してから自動化する。EAS の複数ターゲット用 credentials に Watch bundle identifier の追加も必要。

## 認証と安全性

- iPhone から受け取った Supabase access token は Watch の Keychain に保存する。
- refresh token は Watch に保存しない。
- iPhone が新しい access token を取得するたびに `updateApplicationContext` で上書きする。
- API は既存の Bearer 認証、権限判定、テナント絞り込みを通す。
- Watch では顧客電話番号、住所、請求額、備考、写真を取得しない。

## 実機確認項目

- 41 / 45 / 49 mm の文字切れ
- iPhone が近くにない状態での一覧再読込
- access token 期限切れ後の iPhone 再同期
- 同じ案件を iPhone と Watch から同時更新した際のエラー表示
- iPhoneで作業詳細を開いたとき、ロック画面とWatchのSmart Stackに作業が表示されること
- Watchで工程を進めたとき、Live Activityの工程・進捗・残り時間が更新されること
- Watchで選んだ撮影段階がiPhoneへ引き継がれること
- 写真アップロード成功時は成功振動、失敗時は失敗振動になること
- 「Ledraで工程を進める」で確認画面が出てから更新されること
- 「Ledraで作業メモ」で音声入力した内容が車両履歴へ保存されること
- 最終工程で確認ダイアログが出ること
- VoiceOver と Dynamic Type
