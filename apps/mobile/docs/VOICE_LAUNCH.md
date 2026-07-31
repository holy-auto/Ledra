# 「レドラ」で音声起動する — 設計と手順

施工士がモバイルアプリでデータ入力するとき、「レドラ」と声で呼んで起動・入力開始できるようにするための設計メモと運用手順。

結論を先に:

- **アプリ単体で「レドラ」とだけ言って（アプリが閉じた状態から）起動することは、iOS / Android の OS 制約でできない。** 常時マイクを聞き続けてアプリを起動する“ホットワード”（「Hey Siri」「OK Google」）は OS のアシスタント専用で、サードパーティアプリは登録できない。閉じたアプリのバックグラウンド常時録音は両 OS が禁止している（バッテリー・プライバシー）。
- 実現できるのは次の2系統。**A は今日から追加実装ゼロで使える**。B は実機ビルドを伴う次段の実装。

| 方式 | 体験 | 実装状況 |
|------|------|----------|
| **A: アシスタント経由で起動** | 「Hey Siri／OK Google、レドラ」→ データ入力画面に直行 | 既存の `ledra://` スキームで**今すぐ可能**（本書の手順） |
| **B: アプリ内ウェイクワード** | アプリ起動中に「レドラ」→ 音声データ入力開始 | 未実装（本書末尾のロードマップ）。要ネイティブ音声認識＋実機ビルド |

---

## A. アシスタント経由で起動（今すぐ使える）

### 仕組み

`apps/mobile/app.json` に `"scheme": "ledra"` があり、expo-router はカスタムスキームのディープリンクをファイルベースのルートへ自動解決する。つまり **アプリを追加実装しなくても** 次の URL が既存画面へ直行する。

| URL | 遷移先（ファイル） | 用途 |
|-----|--------------------|------|
| `ledra://certificates/new` | `src/app/certificates/new.tsx` | 新規 施工証明書の入力 |
| `ledra://reservations/new` | `src/app/reservations/new.tsx` | 新規 予約の入力 |
| `ledra://customers/new` | `src/app/customers/new.tsx` | 新規 顧客の入力 |
| `ledra://vehicles/new` | `src/app/vehicles/new.tsx` | 新規 車両の入力 |
| `ledra://(tabs)` | タブトップ | 通常起動 |

> 注意（未検証・実機で確認）: カスタムスキームは先頭セグメントがホスト名として解釈される差異があるため、実機では必ず一度検証する。
> ```
> npx uri-scheme open ledra://certificates/new --ios
> npx uri-scheme open ledra://certificates/new --android
> ```
> 期待どおり開かない場合は `ledra:///certificates/new`（スラッシュ3本）や `expo-linking` の `Linking.createURL('/certificates/new')` が出力する形を使う。

前提: 開発ビルド（dev-client）／TestFlight／本番ビルドのいずれか。スキームは Expo Go では効かないため実機は EAS ビルドが必要。ログイン済みで背面待機している状態からの起動が主要ユースケース（未ログイン時は入力画面が空で開く）。

### iOS 設定手順（ショートカット / Siri）

1. 「ショートカット」アプリ → 新規ショートカット。
2. アクション「**URL を開く**」を追加し、`ledra://certificates/new` を入力。
3. ショートカット名を「**レドラ**」にする（この名前が Siri の呼び出し語になる）。
4. 使うとき: 「**Hey Siri、レドラ**」→ 新規証明書の入力画面が開く。

- 制約: 先頭の「Hey Siri」は省略できない（ウェイク検出は OS が握る）。
- 施工種別ごとに複数登録可（例: 「レドラ コーティング」→ `ledra://certificates/new?service=コーティング`）。クエリは `useLocalSearchParams` で受けられる（プリフィルは B ロードマップ側の小改修で対応）。

### Android 設定手順（アシスタント / ルーティン）

1. Google アシスタントを開く → 設定 → **ルーティン** → 新規。
2. 開始条件（音声）に「**レドラ**」を登録。
3. 操作に「アプリ／リンクを開く」を追加し、`ledra://certificates/new` を指定（機種により「リンクを開く」の可否が異なるため、不可なら後述の App Actions を検討）。
4. 使うとき: 「**OK Google、レドラ**」→ 入力画面が開く。

- 端末・ランチャーによってはホーム画面にディープリンクのショートカットを直接置ける。

---

## B. アプリ内ウェイクワード（実装ロードマップ）

アプリを開いている間、「レドラ」と発話したら音声データ入力を開始する。**フォアグラウンド限定**（背面ではマイクが止まる）。現状のサンドボックスに実機・EAS ビルドが無く動作検証できないため未実装。実装時の設計を以下に残す。

### 参照実装（既存）

Web/PWA 側は既に音声入力が動いている。同じサーバ経路をモバイルからも叩けば、モバイルの追加はクライアント側の音声認識だけで済む。

- 書き起こし整形: `src/lib/ai/voiceMemoReformat.ts`（生 transcript → 証明書ドラフト `{ title, description, cautions }`）
- API: `src/app/api/admin/certificates/voice-memo/route.ts`
- Web UI: `src/app/admin/certificates/new/VoiceMemoPanel.tsx`（ブラウザ Web Speech API で transcript 生成）

### モバイル実装の選択肢（音声認識）

1. **Picovoice Porcupine（推奨）** — オンデバイスのカスタムウェイクワード。「レドラ」を学習させ、オフラインかつ低消費で常時（フォアグラウンド）検知できる。ウェイク検知後だけ本格 STT を起動する二段構えにできる。
2. `expo-speech-recognition` / `@react-native-voice/voice` — 端末 STT を直接使い、認識テキストに「レドラ」が含まれたら開始。導入は軽いが常時待受には向かない。

いずれも Expo の dev-client 再ビルドが必要。

### 必要な前提整備（未対応ギャップ）

- **iOS マイク権限が未設定**: `app.json` の `ios.infoPlist` に `NFCReaderUsageDescription` / `NSCameraUsageDescription` はあるが **`NSMicrophoneUsageDescription` が無い**。B 実装時に追加必須。
- Android は `app.json` に `RECORD_AUDIO` 済み。
- フォアグラウンド限定・マイク使用中の明示表示（プライバシー）。

### 深掘り版 A（任意）: ネイティブ App Intents

手動ショートカット登録を不要にし、アプリ自身が「レドラ」フレーズを OS に事前登録する。

- iOS: App Intents / App Shortcuts（Swift）。Expo 標準には無く、config plugin で AppIntents 拡張を注入 → EAS ビルド。
- Android: `shortcuts.xml` + App Actions（BII / カスタム capability）。config plugin で注入 → EAS ビルド。

いずれも実機ビルド・端末実機での検証が前提。優先度は A（手順運用）が回ってから。

---

## 検証チェックリスト

- [ ] 実機ビルドで `npx uri-scheme open ledra://certificates/new` が入力画面に着地する
- [ ] iOS ショートカット「レドラ」→「Hey Siri、レドラ」で起動
- [ ] Android ルーティン「レドラ」→「OK Google、レドラ」で起動
- [ ] （B着手時）`NSMicrophoneUsageDescription` 追加とマイク権限フロー
