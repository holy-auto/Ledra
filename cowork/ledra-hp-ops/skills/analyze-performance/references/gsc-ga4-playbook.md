# GSC / GA4 分析プレイブック

読み取り専用で分析する。数値は必ずデータ由来、推測は「仮説」と明記。期間・定義を毎回そろえる。

## Search Console（GSC）

主要ディメンション/指標: `query`, `page`, `country`, `device` × `clicks`, `impressions`, `ctr`, `position`。

推奨ビュー:
- **期間比較**: 直近 28 日 vs 前 28 日（または 7d vs 前 7d）。サイト全体＋主要ページ別。
- **伸び/落ち**: clicks の増減 Top N、impressions は増えたのに clicks が減った（CTR 低下）ページ。
- **CTR 機会**: `impressions` 上位かつ `ctr` が低いクエリ/ページ。掲載順位ごとの期待 CTR を目安に「期待より低い」ものを優先。
- **Striking distance**: `position` がおよそ **11〜30**（10.x〜30）かつ `impressions ≥` 一定（例 100/28日）のクエリ/ページ。あと一歩で1ページ目 → 強化の費用対効果が高い。

CTR が期待より低い → タイトル/ディスクリプション/リッチリザルト（構造化データ）の改善（`seo-maintenance`）。
Striking distance → 該当ページの見出し・本文の網羅性・内部リンク・一次情報の追加（`seo-maintenance`/`publish-article`）。

> クエリは GSC では匿名化・しきい値があり、合計が一致しないことがある。比較時は同一条件で。

## GA4

公式 MCP（`analytics-mcp`）の `run_report` / `run_funnel_report` / `run_realtime_report` を使う。

代表的な指標/ディメンション:
- 指標: `sessions`, `activeUsers`, `engagedSessions`, `engagementRate`, `averageSessionDuration`, `conversions`, `eventCount`, `keyEvents`。
- ディメンション: `date`, `sessionDefaultChannelGroup`（流入チャネル）, `sessionSource`/`sessionMedium`, `landingPagePlusQueryString`, `pagePath`, `deviceCategory`, `country`。

推奨レポート:
- **概況**: 期間比較で sessions / engagementRate / conversions / CVR（conversions ÷ sessions）。
- **チャネル別**: organic / direct / referral / paid の貢献と変化。
- **LP 別**: `landingPagePlusQueryString` で集客力の高い/弱い入口。直帰・低エンゲージメント LP は CVR 改善候補。
- **ファネル**: 主要 CV（問い合わせ/資料DL/ROI 試算）に至る経路の歩留まり（`run_funnel_report`）。

> CV 定義（key events）が GA4 側でどう設定されているか確認してから CVR を語る。サンプリング/しきい値に注意。

## PostHog（補助）

オンサイトのイベントは `src/lib/marketing/analytics.ts` に型定義あり:
`cta_clicked {location,label,href}`, `lead_submitted {source}`, `document_download_*`, `roi_calculated`, `page_section_viewed` 等。
CTA クリック → `lead_submitted` の歩留まりで CTA/フォームの効きを裏取りできる（GA4 の CV と突合）。

## 機会 → アクションの対応表

| 兆候 | 一次アクション | 担当スキル |
| --- | --- | --- |
| impressions 高 / CTR 低 | title・description・構造化データ改善 | seo-maintenance |
| position 11〜30 / impressions 有 | 本文網羅性・内部リンク・一次情報追加 | seo-maintenance + publish-article |
| 特定クエリの需要増 | その意図に答える記事/FAQ を追加 | publish-article / weekly-ops(FAQ) |
| LP の直帰高 / CVR 低 | CTA 文言・配置・フォーム摩擦の仮説検証 | monthly-ops(CVR計画) → daily/seo |
| 新クエリ群に該当ページ無し | 新規 LP 候補として要件定義 | monthly-ops(LP候補) |

## データ未接続時

GSC/GA4 が未接続なら、分析を捏造せず「未接続のため取得不可」と明記し、`CONNECTORS.md` の設定手順を案内する。
