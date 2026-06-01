# Press Kit — PR TIMES 入稿用画像

`docs/marketing/prtimes-press-release-2026-06-anchoring.md`（改ざん検知付き施工証明）に添付する画像一式。
PR TIMES の管理画面でそのままアップロードできます。

## 画像一覧

| ファイル | 用途 | サイズ(px) | 元アセット |
|---|---|---|---|
| `ledra-ogp-1200x630.png` | メイン画像 / サムネイル | 1200×630 | `src/app/opengraph-image.tsx` を再現 |
| `anchoring-diagram-1832x928.png` | 本文：3層改ざん検知のフロー図 | 1832×928 | `src/components/marketing/diagrams/PolygonAnchoringDiagram.tsx`（実コンポーネントの SVG） |
| `authenticity-badge-card-1000x520.png` | 本文：公開検証ページの真正性バッジ | 1000×520 | `src/components/customer/AuthenticityBadge.tsx`（`basic` グレードの実コピー） |

> バッジ画像は外部ロゴ（Polygon / C2PA 等）を含まず、テキストのみで構成しています。
> 画像内に各社ロゴを使う場合は、`docs/brand-contacts.md` で許諾要否を確認してください。

## 表現の正確性メモ

- 記載する技術は **C2PA 写真署名 / SHA-256 / Polygon アンカリング** の提供中3層のみ。
- バッジは `basic`（「記録ハッシュ検証済み」）を採用。**デバイス証明・ディープフェイク検知は未提供**
  （`src/lib/anchoring/authenticityGrade.ts` 参照）のため、画像・原稿とも「今後の展開」に留めています。

## 再生成

```bash
npm i satori @resvg/resvg-js     # 一時的に入れるだけで可（アプリ依存には不要）
node docs/marketing/press-kit/generate.mjs
```

- ブラウザ不要。`next/og` と同じ Satori + resvg で描画します。
- 日本語は端末の日本語フォントを埋め込みます（IPAGothic / Noto Sans CJK 等を自動探索）。
  見つからない場合は `apt-get install fonts-ipafont-gothic` などで導入してください。
- 文言やサイズを変えたいときは `generate.mjs` を編集して再実行します。
