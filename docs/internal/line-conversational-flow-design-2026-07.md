# LINE 会話フロー自動化 — 全体設計書 (2026-07)

## 0. この文書の位置づけ

LINE 公式アカウントで「見積り問い合わせ → 見積り提示 → 可否 → 日程調整 →
入庫 → 施工 → 請求 → 支払い」までを、**会話をまたいで**半自動で進めるための
設計書。実装はこの設計に沿ってフェーズ分割で進める。まだコードは書かない。

現状 (2026-07 時点) の到達点:

- 店舗ナレッジ / 全店舗共有ナレッジによる LINE 自動応答 (Q&A) は実装済み
  (`inbound_message.auto_reply_knowledge`)。
- 価格問い合わせへの **概算見積りレンジの自動返信** は実装済み
  (`quote.auto_reply_rough_estimate`)。
- **正式見積書の下書き自動起票** は実装済みだが既知顧客のみ・スタッフ通知のみ
  (`quote.auto_draft_from_inbound`)。

不足しているのは「会話を状態として保持し、顧客の OK/NG や選択に応じて分岐を
進める」レイヤー。本書の中心はそれ (§3)。

---

## 1. なぜ現状は「概算連絡」で止まるのか (背景)

受信処理は **1 メッセージを単発で解釈して 1 アクション返すだけ**で、会話状態を
持たない。3 段で止まる:

1. `quote.auto_reply_rough_estimate` は仕様上「概算レンジ + "詳細はご来店で"」
   しか返さない (`src/lib/ai/automation/quoteReplyAuto.ts`)。正式見積書は出さない。
2. 正式見積書を作る `quote.auto_draft_from_inbound` は既知顧客のみ・スタッフ用
   下書き止まりで顧客には送らない (`src/lib/ai/automation/quoteDraftAuto.ts`)。
3. 仮に見積書を送っても、次の「OKです」は受信箱にテキストとして積まれるだけ。
   LINE のボタン (postback) も `[メニュー操作]` として記録されるのみで分岐しない
   (`src/lib/line/client.ts` の `handleWebhookEvents`)。

つまり土台の業務機能は揃っているが、**会話状態機械 (state machine)** が無い。

---

## 2. 確定した方針 (ユーザー合意事項)

- **概算見積り**: 従来どおり自動送付 (非拘束・レンジ・要来店)。
- **詳細/正式見積り**: 詳細には情報が要るため、まず顧客に
  **「車検証の写真」または「車種 + 年式」** を尋ねる。取得できたら
  **正式見積書の "下書き" を作成** する (送付はスタッフが確認して行う = 壁3 維持)。
- **金額の外向き確定 (正式見積書・請求書の送付)** は要所で人が 1 タップ挟む
  (完全自動送付はしない)。会話・日程調整・提案までは自動で進める。
- **UI は LINE ボタン (クイックリプライ / リッチメニュー = postback) を主**とし、
  自由文は分類でフォールバック。
- **未登録の新規客**: 概算見積りを送った**後に顧客登録 (本人確認) を促す**。
  登録が済んでから詳細見積り (車検証 / 車種+年式) の収集に進む。既知顧客は
  この登録ステップをスキップ。
- **放置フローは 72h で失効**しスタッフ引き継ぎ。**NG・想定外返信もスタッフ
  引き継ぎ**に切り替える (自動進行を止める)。
- 着手は**まず本設計書**から。合意後にフェーズ実装。

---

## 3. アーキテクチャの中核 — 会話状態機械 (State Machine)

### 3.1 新テーブル `line_conversation_flows`

スレッド (顧客 or 未紐付け LINE ユーザー) ごとに 1 本の進行中フローを持つ。

```
line_conversation_flows
  id              uuid pk
  tenant_id       uuid not null → tenants
  customer_id     uuid null  → customers            -- 紐付いていれば
  line_user_id    text null                          -- 未紐付けでもスレッドを束ねる
  state           text not null                      -- §3.2 の状態 enum
  context_json    jsonb not null default '{}'        -- §3.3 の文脈
  reservation_id  uuid null → reservations           -- 日程確定後
  quote_doc_id    uuid null → documents              -- 見積書
  invoice_doc_id  uuid null → documents              -- 請求書
  last_message_id uuid null → customer_messages      -- トレーサビリティ
  expires_at      timestamptz not null               -- 放置フローの自動失効 (SLA)
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now() -- set_updated_at トリガ
```

- スレッドキーは `customer_id` があれば優先、無ければ `line_user_id`。
  紐付け完了時に `line_user_id` 一致行へ `customer_id` を移送する。
- 部分ユニーク索引で **1 スレッド 1 進行中フロー**を担保
  (`state NOT IN ('closed','expired')` の行を tenant × キーで一意)。
- RLS はテナントメンバー参照 / service-role 書き込み (webhook に auth 無し。
  既存 `customer_messages` と同方針)。
- `expires_at` は既定 72h。過ぎたフローは cron で `expired` にし、必要なら
  スタッフに引き継ぎ通知。

### 3.2 状態 (state) の一覧と遷移

全遷移でボタン (postback) を主、自由文は分類でフォールバック。

```
none / idle
  │  価格問い合わせ受信 → 概算見積り自動送付 (既存・非拘束)
  ▼
[A0] awaiting_registration        -- 未登録の新規客のみ。顧客登録(本人確認)を促す
  │  登録完了 (既知顧客は [A0] を飛ばして直接ここへ)
  ▼
[A] awaiting_quote_detail        -- 車検証写真 or 車種+年式 を依頼中
  │  車検証写真 or 車種+年式 を受信 → OCR/抽出 → サイズ・価格算出
  ▼
[B] formal_quote_drafted         -- 正式見積書 draft 作成済 (オプション提案込)。スタッフが送付
  │  スタッフが draft→sent (既存 quote.auto_send_on_confirm で LINE 送付)
  ▼
[C] awaiting_quote_ok            -- 見積り送付済、OK/NG 待ち
  │  「OK」→[D]   「NG/修正」→ スタッフ引き継ぎ (human)   「オプション不要」→[E]直行
  ▼
[D] awaiting_option_confirm      -- 基本OK。オプション付けるか確認中
  │  選択受信 → 見積書を更新して再送 (draft→スタッフ送付)
  ▼
[E] awaiting_final_ok            -- 最終見積り送付済、最終OK待ち
  │  「OK」
  ▼
[F] awaiting_schedule_pick       -- 代車空き+作業日候補を提示、選択待ち
  │  候補選択 → reservation 作成 (カレンダー/代車/稼働に反映) → お礼文でクローズ
  ▼
[G] scheduled                    -- 予約確定。ここで“商談”フローはクローズ扱い
        ├─ (登録車両あり)   → 施工完了時に証明書 draft (既存)
        └─ (未登録)         → 入庫日: 車検証撮影を依頼 → 車両登録 → 証明書 draft
  │  施工進行 (スタッフ操作)
  ▼
[H] awaiting_extra_work_ok       -- 追加作業が発生 → 顧客に確認中 (発生時のみ)
  │  「OK」→ 請求書 draft に追加
  ▼
[I] awaiting_invoice_finalize    -- 「作業終了」ボタン → 金額確定の確認 (スタッフ 1 タップ)
  │  確定 → 請求書を LINE 送付
  ▼
[J] awaiting_payment_method      -- 支払方法を質問中
  │  「クレカ/振込」→ 決済リンク送付   「現金/QR」→ 定型文送付
  ▼
[K] closed
```

- 途中どの状態でも「スタッフが会話に介入」できる。スタッフが手動返信したら
  該当フローを `human_takeover` フラグにして自動進行を止める (誤爆防止)。
- 顧客が脈絡外の発言 (別件質問) をしたら、ナレッジ自動返信 (既存) にフォール
  バックしつつフロー状態は保持する。

### 3.3 context_json に持つもの

```jsonc
{
  "service": "コーティング",
  "vehicle": { "maker": "トヨタ", "model": "アルファード", "year": 2022, "size_class": "LL" },
  "vehicle_source": "shakensho" | "text",       // 車検証写真 or テキスト申告
  "base_quote": { "doc_id": "...", "total": 120000 },
  "selected_options": ["ヘッドライトコーティング"],
  "proposed_slots": [{ "date": "2026-07-20", "loaner": true, "staff_id": "..." }],
  "extra_work": [{ "desc": "...", "amount": 8000, "approved": true }],
  "payment_method": "credit" | "bank" | "cash" | "qr"
}
```

### 3.4 入口: postback と状態別インタープリタ

- **postback ディスパッチャ** を新設 (`src/lib/line/client.ts` の postback 分岐を
  「受信箱にログするだけ」から「進行中フローがあれば `data` で分岐」に拡張)。
  クイックリプライ/リッチメニューの `data=flow:option:yes` 等を状態に応じて処理。
- **状態別インタープリタ**: フロー進行中は汎用の予約抽出 (`extractInboundReservation`)
  ではなく、状態に応じた軽量判定を使う:
  - `awaiting_quote_ok` / `awaiting_final_ok` / `awaiting_extra_work_ok` →
    **YES/NO/保留 の 3 値分類** (Haiku、プロンプトインジェクション対策込)。
  - `awaiting_option_confirm` → 提示オプションからの選択抽出。
  - `awaiting_schedule_pick` → 提示スロットからの選択抽出。
  - `awaiting_payment_method` → credit/bank/cash/qr の分類。
  自由文にもボタンにも両対応 (ボタン優先、無ければ分類)。
- 分類が曖昧 (低 confidence) の場合は自動で進めず、聞き返す or スタッフ引き継ぎ。

---

## 4. 既存部品の再利用マップ

| 機能 | 状態 | 再利用先 |
|---|---|---|
| A. 見積書 作成/送付 | 部分 | `quoteDraftAuto.ts` / `documentAuto.ts` (draft→確定送付) |
| B. サイズ×価格 | 部分 | `ai/utils.ts sizeMultiplier` / `quoteFromVehicle.ts` (過去実績統計) |
| C. オプション提案 | **新規** | — (§5) |
| D. 予約・日程候補 | あり | `src/lib/booking/candidates.ts` / `api/admin/booking-candidates` |
| E. 代車 空き | あり | `loaner_cars` / `reservations.loaner_car_id` / booking-candidates |
| F. 稼働管理 | あり | `staff_shifts` / `booths` / `gantt/board.ts` |
| G. カレンダー | あり | `lib/gcal/client.ts` (予約作成で自動連携) |
| H. 証明書 下書き | あり | `certificateRecordAuto.ts` (登録車両ゲート) |
| I. 車検証 OCR | あり | `ocr/shakensho*.ts` / `parse-shakken*` ルート |
| J. 請求書/決済リンク | あり | `invoiceRecordAuto.ts` / `send-line-payment-link` / Stripe |
| K. 支払方法分岐 | **新規** | — (§6) |
| L. 会話状態機械 | **新規・最重要** | — (§3) |

**ゼロから作るのは L・C・K の 3 つ。** 残りは「LINE 会話フロントを状態機械に
配線する」作業。

---

## 5. 新規: オプション/アドオン提案 (C)

- 見積書 draft 生成時 (状態 [B]) に、車種・施工内容・過去実績から
  **おすすめオプションを 1〜3 件**生成する軽量 AI 呼び出しを追加。
- 出力は「提案オプション名・想定価格・一言理由」。見積書 draft の備考 or
  別セクションに載せ、状態 [D] の確認メッセージに使う。
- 回答ソースは既存メニュー (`menu_items`) を優先し、無ければ過去請求実績。
  ナレッジ同様「勝手に作らない」制約 (登録メニュー外の提案は控えめに)。
- 実装: `src/lib/ai/optionRecommend.ts` (純関数 + AI)、テスト付き。

---

## 6. 新規: 支払方法の分岐 (K)

- 状態 [J] で「お支払い方法をお選びください」+ クイックリプライ 4 択
  (クレジット / 振込 / 現金 / QRコード決済)。
- 分岐:
  - **クレジット / 振込** → 既存 `send-line-payment-link` (Stripe Connect) で
    決済リンクを送付。
  - **現金 / QR** → 定型文
    「承知いたしました。当日お待ちいたしておりますのでお気をつけてお越し
    くださいませ」を送付。
- 選択は `reservations.payment_method` (新カラム) と context に保存。
- `payment_status` (既存: unpaid/paid/…) とは別概念 (方法 vs 決済状態)。

---

## 7. 安全設計 (壁3 との整合)

- 会話状態機械は**会話を進めるだけ**。金額の外向き確定 (正式見積書・請求書の
  送付) は既存の opt-in と人の 1 タップを尊重する:
  - 概算見積り送付: 非拘束のため自動 (既存どおり)。
  - 正式見積書: draft を作り、送付は `quote.auto_send_on_confirm` (人が確定)。
  - 請求書: draft + 金額確定確認 (状態 [I] でスタッフ 1 タップ) → 送付。
- 全機能 opt-in・既定 OFF。マスタースイッチ
  `inbound_message.auto_conversation_flow` + ステップ別 opt-in を actionCatalog に
  追加 (既存カタログ方針に踏襲)。
- 監査ログ (`logAutoActionExecuted`) に各遷移・各送信を記録。
- LINE push は課金対象。無駄な再送・ループを防ぐため、同一状態での再送は
  クールダウン + 冪等キー (`flow_id + state`) で抑止。

---

## 8. フェーズ計画

- **Phase 0 (本書)**: 全体設計。✅ 完了
- **Phase 1a**: 会話状態機械の骨格 + 入口 (実装済み)
  - `line_conversation_flows` テーブル + RLS + 一意索引 + 失効期限列
    (`supabase/migrations/20260712000000_line_conversation_flows.sql`)
  - 純粋な状態機械 (`src/lib/line/flow/states.ts`) + 受信解釈
    (`interpret.ts`) + 文面 (`messages.ts`) + 永続化 (`flowStore.ts`) — 全テスト
  - opt-in `inbound_message.auto_conversation_flow` + orchestrator 述語
  - **入口配線**: 価格問い合わせ受信 → 概算見積りの後に「正式見積りのため
    車検証写真 or 車種+年式を教えてください」と続けて尋ね、スレッドを
    `awaiting_quote_detail` として記録 (`conversationFlowAuto.ts`、inboundAuto から
    fire-and-forget)。これで「概算だけで終わる」状態を解消。
- **Phase 1b-1**: 詳細受領 → 正式見積書 draft (実装済み)
  - 見積り下書きの共有コアを抽出 (`quoteDraftCore.ts`、quote.auto_draft_from_inbound と共用)
  - `awaiting_quote_detail` のフローに対し、顧客の詳細返信 (車種+年式) を取り込み
    正式見積書 draft を作成 → `quote_drafted` へ進め、顧客へ「担当より正式見積りを
    お送りします」と返信 + スタッフ通知 (`maybeAdvanceQuoteFlowOnDetail`)
  - 既知顧客のみ (未紐付け客の登録誘導 [A0] は 1b-2)。この受信を処理したら他の
    自動返信 (概算・ナレッジ) はスキップ (二重返信防止)
- **Phase 1b-2**: 可否ゲート (実装済み)
  - postback ディスパッチャ (line/client.ts の postback 分岐を会話フローへ) +
    LINE ボタン送信 (`sendCustomerLineButtons`)
  - スタッフの見積り送付 (documents draft→sent) で [B]→[C] へ遷移し OK/NG ボタンを
    付与 (`maybeAdvanceFlowOnQuoteSent`)
  - 顧客の可否 postback で分岐 (`handleFlowPostback`): はい → 日程調整へ (現状は
    スタッフ引き継ぎ + 案内 + 通知) / 相談する・想定外 → スタッフ引き継ぎ
- **Phase 1b-3**: 日程調整の自動化 (実装済み)
  - [C]OK → 空き日程候補を取得 (`fetchFlowScheduleCandidates` — 既存の純粋関数
    `proposeCandidates` を service-role で簡易呼び出し。品目 ID が無いため所要時間
    フィルタ・代車/人手判定は未適用、`limit=3` 件をボタン提示) → 候補ゼロ件なら
    従来どおりスタッフ引き継ぎ
  - 顧客がスロット選択 (`flow:slot:<index>`) → 選択日を再取得して直前の空き状況を
    再検証 → 埋まっていればスタッフ引き継ぎ (お詫び文)、空いていれば `reservations`
    へ確定作成 (status=confirmed。顧客の明示的な承認を経ているため「【要確認】」は
    付けない) + gcal 同期 (`syncCreateEvent`、非ブロッキング) → フローを `closed` に
    してお礼メッセージ送信 + スタッフ通知
  - 残課題 (次フェーズ): オプション提案 (Phase 2) / 車検証 OCR での詳細受領 (画像) /
    [A0] 未登録客の登録誘導 (既存 intake 招待の再利用)
- **Phase 1b-3 追加修正**: 案件登録時の勘定科目提案・ワークフロー提案フック
  (`maybeAutoCategorizeReservationOnIntake` / `maybeAutoProposeWorkflowForReservation`)
  を `handleSlotSelected` の予約作成後に配線 (管理画面の予約作成ルートと同じ挙動に
  揃えた。実装済み)
- **Phase 2**: オプション提案 [D]/[E] (実装済み)
  - `src/lib/ai/optionRecommend.ts` (純関数 + AI、テスト付き) — 登録メニュー
    (`menu_items`) を優先し、無ければ過去請求実績からのみ提案 (ナレッジ同様「勝手に
    作らない」— 登録メニューがあるときは AI 提案を候補の `id` に厳密一致するものだけに
    絞り込む)
  - `src/lib/line/flow/addonCandidates.ts` (IO) — テナントの登録メニューを取得し
    (施工内容カテゴリで緩く絞り込み、基本見積りと同名の品目は除外)、
    `generateOptionRecommendations` を呼ぶ
  - [C] OK 直後、`fetchAddonRecommendations` を呼び 1 件も無ければ [F] 日程候補へ直行
    (Phase 1b-3 の挙動を維持)。1〜3 件あれば [D] へ進めボタン提示
  - [D] で顧客がオプションを選択 → 見積書 `documents` に明細を追加して再計算
    (`calcItems`) し `status: draft` に戻す (再送はスタッフの draft→sent 操作を経る。
    壁3 維持) → `quote_drafted` へ戻し、`maybeAdvanceFlowOnQuoteSent` が
    `selected_options` の有無で初回送付 ([C]) か再送 ([E] 最終確認) かを判定
  - [D] で「オプションなしで進める」→ 内容が変わらないため [E] の再確認を挟まず
    直接 [F] へ (意図的な近道。実装ノート参照)
  - [E] 最終OK → [F]。「相談する」→ スタッフ引き継ぎ
  - 選ばれたオプションが登録メニュー由来なら `reservations.menu_items_json` に実品目
    として反映 (基本見積り明細は引き続き自由記述のため反映されない。既知の限界として
    コード内に ponytail コメントで明記)
  - 実装ノート: MVP は「1 件まで選択」に単純化 (design 上の `selected_options` 配列は
    複数対応を示唆するが、LINE クイックリプライの UX 上、複数選択ループは別途必要に
    なったら追加する)。代車必須判定・人手判定・受入カテゴリ絞り込み
    (`needsLoaner`/`considerStaff`/`workCategories`) は本 Phase でも見送り — これらは
    「代車が要るか」という追加の質問が要り、今回のオプション提案 (アドオン選択) とは
    別の関心事のため、必要になった時点で別途対応する
- **Phase 3**: 証明書分岐 — 登録車両あり (既存) / 未登録→入庫日車検証撮影→登録→draft
- **Phase 4**: 請求書 — 追加作業の LINE 承認 [H]、作業終了→金額確定 [I]→送付
- **Phase 5**: 支払方法分岐 (K)

各フェーズは独立に opt-in でき、Phase 1 だけでも「見積り〜日程」まで価値が出る。

---

## 9. 決定事項 / 残る検討

**決定済み (ユーザー合意):**

1. **UI 手段**: LINE ボタン (クイックリプライ / リッチメニュー = postback) を主、
   自由文は分類でフォールバック。
2. **失効時間**: 放置フローは **72h で失効** → スタッフ引き継ぎ。
3. **未登録顧客**: **概算見積り送付後に顧客登録 (本人確認) を促す** ([A0])。
   登録後に詳細見積りへ進む。既知顧客はスキップ。
4. **NG 時の扱い**: 「NG」・想定外返信は**スタッフ引き継ぎ**に切り替え、自動進行
   を止める。

**残る検討 (初版は下記デフォルトで進め、運用を見て調整):**

5. **同時複数問い合わせ**: 初版は **1 スレッド 1 フロー**。進行中に別件が来たら
   スタッフ引き継ぎ。
6. **価格精度**: 過去実績が無い車種の正式見積りは、初版は過去実績 + スタッフ
   確認で吸収。将来メニュー×サイズの価格表整備で底上げ (B の改善)。
