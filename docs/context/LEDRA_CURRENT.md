# LEDRA_CURRENT.md — 現在の事業・プロダクト状況

> このファイルは「今の Ledra がどういう状態か」のスナップショット。更新履歴は
> 追わず、常に最新状態だけを保つ（履歴は DECISION_LOG.md / RELEASE_LOG.md 側）。
> 大きな変化があったら都度上書きすること。

最終更新: 2026-07-30

## 会社・代表者

- 運営: 株式会社HOLY（2024年11月法人化）
- 代表: 堀越友輔
  スポーツトレーナー専門学校中退 → 町の整備工場で整備・鈑金塗装・コーティング・
  用品取付を経験 → 独立し47都道府県で出張作業メインに事業展開 → 法人成り。
  自動車業界の信頼低下・大手不正を背景に、AIと現場知見を融合したLedraを開発。

## プロダクト概要

**対外ポジショニング（SEO/GEO の一言）**: 「自動車整備・コーティング店の施工履歴プラットフォーム」。
2026-07-27 に旧「WEB施工証明書SaaS」から刷新し、同日 PR TIMES の表記に合わせ「施工履歴プラットフォーム」に統一
（施工証明書は主要機能の1つとして残す。買い手検索語は description/keywords 側で確保）。
サイトの title/description/OGP・JSON-LD・robots は `src/lib/marketing/config.ts` の `siteConfig`
（siteTagline / siteDescription / keywords / featureList）を単一情報源として参照する。
詳細は DECISION_LOG.md / RELEASE_LOG.md 2026-07-27 を参照。

自動車整備 / ボディリペア / コーティング / PPF 店向けのマルチテナント SaaS。
施工証明書発行、請求・帳票、顧客ポータル、予約、保険会社（損保）との案件連携、
部品装着インテグリティ（装着部品の真正性証明）、AI 業務自動化、ブロックチェーン・
アンカリング + RFC3161 タイムスタンプによる証明書・装着記録の改ざん検知までを
一本化して提供する（出典: README.md）。

管理画面のナビゲーションは、常時表示をコア機能に絞る slim 表示＋「AIに聞く」チャット
（自由文→画面遷移）＋名前・番号での横断検索（顧客/車両/証明書/請求書）＋ピン留めで構成し、
機能過多でも目的の画面へ速く到達できるようにしている（2026-07 導入, PR #752）。

## 主要機能の柱（README.md より）

- 施工証明書 × 改ざん検知（Polygon アンカリング + 施工前後写真ゲート）
- 作業完了サインオフ・ワークフロー（完了報告 → 証明書発行 → 顧客サイン →
  お会計 → オンチェーン、`src/lib/signoff/state.ts` の `computeSignoffState` に
  順序ゲート・SLA・写真充足判定を集約）
- 部品装着インテグリティ（装着部品の真正性証明）
- 保険会社（損保）との案件連携
- AI 業務自動化（写真改ざん検知・不正スコア等）
- LINE 連携（会話フローによる予約・見積り・オプション提案・証明書通知）
- 管理画面ダッシュボードの「AIに聞く」入口（`AskLedraBar`）: 自由入力をまず決定的な
  キーワード→画面ルーティング（AI不使用・無料）で解決し、未マッチ時のみ既存の
  `qaAssistant`（施工ナレッジRAG）にフォールバック。承認インボックスは下書きごとに
  実データがある種別だけ「なぜ」（証明書=AI信頼度、発注=起票理由の実文言）を表示し、
  根拠データの無い請求書には表示しない（PR #819）。

## 技術スタック（package.json / README.md より）

```
Next.js 16.2 (App Router) + React 19.2 (React Compiler)
Supabase (Postgres + Storage + Auth) · Stripe · Upstash Redis + QStash
Sentry · Resend (+ SendGrid fallback) · Anthropic (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)
@react-pdf/renderer · viem/ethers · RFC3161 TSA · Twilio · LINE · Healthchecks.io
```

- テスト: Vitest（単体）/ Playwright（E2E）
- API: 560+ Route Handlers（37 トップレベルグループ、README.md 時点）

## 直近の開発フォーカス（git log 直近30件より、2026-07 時点）

- **レポート収益の施工店還元（2026-07-30, branch claude/merchant-revenue-sharing-22tuq3）**: 有料の車両全履歴レポート売上を、記録を残した施工店へ**記録件数に比例して按分**し蓄積台帳（`vehicle_report_revenue_shares`）に計上する仕組みを実装。還元率は設定値 `merchant_share_bps`（既定 70%）。実送金はせず「pending 計上→後精算」とし、施工店ポータル `/admin/report-revenue` で「あなたの記録が生んだ収益」として可視化して**「技術が、資産になる。」を実体化**。実送金の自動化・返金巻き戻しはスコープ外（後続）。詳細は DECISION_LOG / RELEASE_LOG 2026-07-30。
- **AITURBO対抗フェーズ2（PR #832–#841, 2026-07-27）**: C2PA本格統合と多層GPS整合による真正性強化＋入力低摩擦化を一括実装・main反映。写真ファースト化(A2)・写真→施工内容Visionドラフト(A3 `photo.auto_draft_content`)、写真GPS×店舗の整合(C5・結果のみ保存)、C2PAマニフェスト要約の永続化/表示(B2)、外部C2PAマニフェスト検証(B3・原バイトに実施)、真正性エンジンへのC2PA/GPS統合(B4)、出張モバイルGPS＋作業場所照合(C4・`match_worksite`)。設計原則は**デフォルト無害・非決定的優先・生座標非保存・無駄な推論を呼ばない**。**B1 本番C2PA署名は env 有効化（コード変更なし）で未実施**、外部検証のステージング実サンプル確認・work_lat/lng保持期間・プライバシー文面は未確定（OPEN_QUESTIONS）。詳細は DECISION_LOG / RELEASE_LOG 2026-07-27。
- **AITURBO対抗フェーズ1（PR #830, 2026-07-27）**: 競合 AITURBO（株式会社ルクレ）の「写真を撮るだけ」低摩擦入力を既存資産の接続で吸収。写真打刻（EXIF撮影時刻→施工日/作業時間の提案 `photo.auto_work_stamp`・LLM不使用）、モバイル進捗ラベルの自動補完、C2PA署名への車両VIN封入、`stores` 位置座標列を追加。A2（証明書フォームの写真ファースト化）とPhase2（写真→施工内容Visionドラフト・C2PAマニフェスト永続化/外部検証・GPS整合チェック本体・出張モバイルGPS）は後続。詳細は DECISION_LOG / RELEASE_LOG 2026-07-27、競合分析は同日エントリ参照。
- LINE 会話フロー（Phase 1〜3: 自動予約・日程調整・可否ゲート・オプション提案・
  未登録車両の証明書分岐）の作り込み
- 予約ワークフローとメカニック稼働管理の連動、部品交換記録・証明書LINE通知
- 予約に「終日（1日お預かり）」対応（`reservations.all_day`）: 顧客Web予約・管理画面の
  両方で作成でき、終日予約は当日を丸ごと占有（ダブルブッキング判定・空き状況に反映）
- 顧客予約が入った際の店舗宛通知（メール常時 + Slack任意）を追加。宛先はテナント
  （加盟店）のオーナー/管理者。詳細は DECISION_LOG.md 2026-07-23 を参照
- 帳票管理（一括送付・顧客別集計・グラフ表示・車両情報表示）
- マイグレーション運用の安全化（CHECK 制約は NOT VALID + VALIDATE で追加）
- モバイル/タブレットのUI不具合修正（サイドバースクロール、通知ドロップダウン）
- 運営向け店舗利用状況ダッシュボード（`/admin/platform/store-usage`）: 店舗別の
  月間操作回数・予約/作業記録/請求の累計・機能別利用率を横断確認（ログイン回数は
  未記録のため last_sign_in_at ベースのアクティブ会員で近似）

## 使い方

- 新しい決定は DECISION_LOG.md、実装・公開した変更は RELEASE_LOG.md、
  迷っていることは OPEN_QUESTIONS.md、note記事のネタは NOTE_CANDIDATES.md に書く。
- このファイルは上記4ファイルの要約を随時反映し、「今の状態」を1枚で把握できる
  ようにする。
