# 開発者向けツーリング (DX)

監査レポートで挙がった DX 改善項目の状況。

## 整備済 (本セッション)

### 1. Supabase 型自動生成
- `npm run db:typegen` で `src/types/db.generated.ts` を生成
- CI workflow `.github/workflows/db-typegen.yml` で
  `DB migrate (apply to production)` の成功後に自動 PR
- 必要 secrets: `SUPABASE_DB_URL`（`db-migrate.yml` と同じ接続URI）

### 2. Lighthouse CI
- `.github/workflows/lighthouse.yml` がマーケサイト変更時の PR で実行
- 性能 ≥ 0.85, アクセシビリティ ≥ 0.9 を assertion
- 必要 secrets: `LHCI_GITHUB_APP_TOKEN` (公開ストレージなら不要)

### 3. pre-push hook (vitest --changed)
- `.husky/pre-push` で push 時に変更ファイル関連テストのみ実行
- ドキュメント変更のみは自動スキップ
- 緊急脱出: `SKIP_PREPUSH=1 git push`

### 4. CodeQL (前コミット)
- `.github/workflows/codeql.yml` で SAST を CI に組込済

### 5. シークレット老朽化チェック
- `npm run check:secrets-age` (CI で実行可)
- `.secrets-age.json` を編集して TTL を管理
- ローテ時: `npm run check:secrets-age -- --update STRIPE_WEBHOOK_SECRET`

## 状態文書化のみ (まだ未着手)

### 6. Storybook
- 主要 UI (`src/components/ui/Button.tsx` 等 10 件程度) の visual regression
- 採用すれば PR で UI 変更が画像比較できる
- **追加コスト**: Chromatic 月 $200 + 設定 2 日
- **着手時期**: 受託案件で UI レビュー負荷が増えた時点

### 7. Server Component への漸進的移行
- 80 件の `"use client"` ページのうち、状態を持たないものを SC 化
- **対象候補** (1日で完了する):
  - `/admin/dashboard` (実は SSR で書ける)
  - `/admin/customers/[id]` (read-only ビュー)
  - `/admin/invoices/[id]` (read-only ビュー)
- **対象除外**: 重い editor (`PosClient.tsx`, `ReservationsClient.tsx`)
  → これは Server Component + Client Island に分解する必要があり、
    別 Epic で対応

### 8. OpenAPI 自動生成
- `zod-to-openapi` で `/src/lib/validations/*` から API ドキュメント生成
- 顧客向け API ドキュメント / SDK 生成の母体になる
- **着手時期**: tenant API key (2.2) と outbound webhook (2.1) を実装した後
  (= 顧客が外部から叩く意味が出てから)

## CI ジョブ全体マップ

```
.github/workflows/
├── ci.yml              既存: lint + tsc + vitest + playwright + npm audit + migration lint
├── codeql.yml          SAST (security-extended)
├── db-typegen.yml      Supabase types 自動再生成
├── lighthouse.yml      マーケサイトのパフォーマンス回帰検知
├── mobile-ci.yml       Expo / RN
└── render-video.yml    Remotion での LP 動画レンダリング
```

CI 全体の所要時間:
- 並列実行: lint / tsc / vitest / migration → 〜3 分
- E2E (playwright) → 〜5 分
- CodeQL → 〜10 分 (週次なのでブロックしない)
- Lighthouse → 〜5 分 (PR ブロック条件は設けない)
