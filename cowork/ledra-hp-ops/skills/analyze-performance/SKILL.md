---
name: analyze-performance
description: >
  Pull and analyze Ledra HP performance data from Google Search Console and GA4 (read-only).
  Use when the user asks to "Search Console を分析", "GA4 を分析", "検索パフォーマンスを見て",
  "CTR を分析", "順位11〜30位のページを出して", "流入/CV を分析", or when the daily/weekly/monthly
  routines need data. Returns a structured analysis with opportunities (CTR, striking-distance,
  CVR) — it analyzes and recommends; it does NOT change site files itself.
---

Ledra の公開HPの**検索/行動データ**を Google Search Console と GA4 から取得・分析し、**改善機会**を構造化して返すスキルです。
**読み取り専用**。サイトファイルの変更はしない（変更は `seo-maintenance`/`publish-article` 等が PR で行う）。
詳細なクエリ・指標・解釈は `references/gsc-ga4-playbook.md`。

## 接続（読み取り専用）

- **Google Search Console**: MCP `gsc-readonly`（`.mcp.json`）。検索クエリ・ページ・国・デバイス別の clicks/impressions/CTR/position。
- **GA4**: MCP `analytics-mcp`（公式）。`run_report`/`run_funnel_report` 等でセッション・ユーザー・エンゲージメント・コンバージョン・流入・LP 別。
- **PostHog（任意・補助）**: オンサイトのイベント（`cta_clicked`/`lead_submitted` 等）。CTA/CVR の裏取りに。
- 接続が無い場合は「データ未接続」と明記し、CONNECTORS.md の手順を案内（憶測値で埋めない）。

## 代表的な分析

1. **検索パフォーマンス（GSC）** — 期間比較（例 直近28日 vs 前28日）で clicks/impressions/CTR/avg position。伸びた/落ちたクエリ・ページ Top N。
2. **CTR 機会** — 表示回数が多く CTR がポジション期待値より低いクエリ/ページ（title/description 改善候補）。
3. **Striking distance（順位 11〜30 位）** — 平均掲載順位 10.x〜30 かつ impressions が一定以上のクエリ/ページ（あと一歩で1ページ目）。
4. **行動/CV（GA4）** — セッション・エンゲージメント率・コンバージョン・CVR、チャネル別、LP 別。離脱の大きい導線。
5. **CVR 機会** — CV 経路の落差、主要 LP の直帰/離脱、CTA クリック→送信の歩留まり（PostHog と突合）。

## 出力フォーマット

```
## パフォーマンス分析（<期間> / <比較対象>）
### サマリ（GSC）
- clicks <値>（前比 ±%）/ impressions <値> / CTR <%> / avg position <値>
### サマリ（GA4）
- sessions <値> / engagement rate <%> / conversions <値> / CVR <%>
### 機会（優先度付き）
- [CTR] <クエリ/ページ>: impressions <値>, CTR <%>（→ title/meta 改善案）
- [Striking] <クエリ/ページ>: position <値>, impressions <値>（→ 強化案）
- [CVR] <LP/導線>: <落差>（→ 仮説）
### 注意 / データ前提
- <期間・サンプリング・未接続などの注記>
```

数値は必ずデータ由来。**推測は「仮説」と明示**。固有名詞・URL は実データのものを使う。

## やってはいけないこと

- GSC/GA4/PostHog への書き込み・設定変更。
- 取得できていない指標を埋める / 期間や定義を曖昧にしたまま比較する。
- ここでサイトファイルを編集する（分析と提案に徹し、実装は他スキルへ）。
