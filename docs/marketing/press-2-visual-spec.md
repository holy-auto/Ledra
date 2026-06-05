# プレスリリース#2 ビジュアル仕様（装着インテグリティ / Version B）

> 作成日: 2026-06-05 / ステータス: **社内ドラフト（デザイン指示書）**
> 対象: `src/content/news/2026-06-05-parts-integrity-b.mdx`
> 参照実装: `src/lib/marketing/og.tsx`（`makeOgImage`）/ `src/app/opengraph-image.tsx` / `DESIGN_SYSTEM.md`
> 同梱アセット: `docs/marketing/assets/press-2-verification-flow.svg`（「検証の前後」フロー図・実ファイル）
>
> ⚠️ 画像生成はこの環境では行えないため、本書は **指示書＋すぐ使えるSVG/実装コード** で構成。

---

## 1. ブランドトークン早見表（OG・図で使う実値）

`og.tsx` と `DESIGN_SYSTEM.md` から確定。**ハードコードせず、この値で統一**。

| 用途 | 値 |
|---|---|
| 背景グラデ（ダーク） | `linear-gradient(135deg, #060a12 0%, #0b111c 45%, #0d0b1e 100%)` |
| ベース背景 / サーフェス | `#060a12` / `#0d1525` |
| アクセント青（ブランド） | `#0071e3` |
| 明るい青（図・線・チップ） | `#60a5fa` / `#93c5fd` |
| 紫（タグライン・装飾） | `#a78bfa`（rgb 167,139,250） |
| 成功・検証済（提案色） | `#34d399` |
| テキスト主 / 副 | `#ffffff` / `rgba(255,255,255,0.5〜0.6)` |
| バッジチップ | bg `rgba(96,165,250,0.12)` / 枠 `rgba(96,165,250,0.3)` / 文字 `#93c5fd` / letter-spacing 2px / radius 999 |
| アンビエント光 | 青 `rgba(96,165,250,0.22)` blur 80 ／ 紫 `rgba(167,139,250,0.18)` blur 80 |
| フォント | 見出し: Noto Sans JP 700 ／ 明朝アクセント: Yu Mincho ／ コード/ラベル: Geist Mono |
| 角丸 | 8 / 12 / 16 / 20 / full |
| アイコン | Heroicons outline・18×18・strokeWidth 1.5 |

---

## 2. OGP（最優先・配信前必須）

### 2.1 現状の問題
- `news/[slug]/page.tsx` は記事別OGを **持っていない** → 全記事が汎用 `src/app/opengraph-image.tsx`（`#18181b`・別コピー）にフォールバック。
- 一方 `src/lib/marketing/og.tsx` の `makeOgImage()` は上質（ブランドグラデ＋バッジ＋タイトル＋タグライン）。**こちらに寄せる**。
- ついでに**汎用 `opengraph-image.tsx` も `makeOgImage` ベースに統一**するとサイト全体のOGが揃う（推奨・別タスク）。

### 2.2 記事別OG 実装案（コピペ可）
`src/app/(marketing)/news/[slug]/opengraph-image.tsx` を新規作成：

```tsx
import { makeOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { getContentBySlug } from "@/lib/marketing/content";

export const size = OG_SIZE;            // 1200 x 630
export const contentType = OG_CONTENT_TYPE;
export const alt = "Ledra";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = await getContentBySlug("news", slug);
  // 長い記事タイトルはOGで割れるため、frontmatter の ogTitle / ogSubtitle を優先
  const fm = entry?.frontmatter;
  const title = (fm?.ogTitle as string) ?? fm?.title ?? "お知らせ";
  const subtitle = (fm?.ogSubtitle as string) ?? fm?.excerpt;
  const badge = (fm?.tags?.[0] as string) ?? "NEWS";
  return makeOgImage({ title, subtitle, badge });
}
```
> file-based OG 規約により `generateMetadata` 側で `openGraph.images` を手書きする必要はない（自動配線）。

### 2.3 このリリースのOGコピー（短く・割れない）
`makeOgImage` は title が長いと縮小・はみ出すため、frontmatter に**短いOG専用コピー**を足す：
```yaml
ogTitle: 「“たぶん”を、終わらせる。」
ogSubtitle: 装着部品の真正性を、検証可能な事実に。
# badge は tags[0] = "お知らせ"。PRESS表記にしたいなら badge を別途指定する拡張も可
```
- レイアウト: 左上 `Ledra` ＋ バッジ／中央 大見出し（`ogTitle`）／下 既存タグライン「記録を、業界の共通言語にする。」＋「WEB施工証明書SaaS」。
- 文字数目安: `ogTitle` 全角12〜16字、`ogSubtitle` 全角〜26字。

---

## 3. 「検証の前後」フロー図（同梱SVGあり）

実ファイル: **`docs/marketing/assets/press-2-verification-flow.svg`**（1200×600・ブランド配色・特許セーフ）。記事ヒーロー／OG背景／資料スライドに流用可。

### 3.1 構成（左→右の対比）
```
[BEFORE これまで]                    →     [AFTER  Ledra 装着インテグリティ]
  ・紙の納品書                                記録 → 照合 → 確定 → 刻む → 見せる
  ・担当者の記憶                              （5ステップの鎖）
  ・バラバラのシステム                        ▼
  ━━━━━━━━━━                          [shield] 改ざんを検知 ＝ 検証できる事実
  「誰も検証できない」(くすんだ赤)             (青→緑のアクセント)
```

### 3.2 ルール
- BEFORE は彩度を落とし（グレー＋くすんだ赤 `#f87171` 程度）、AFTER はブランド青→検証済の緑で「解決」を色で語る。
- コピーは**特許セーフ**：5ステップ名・「改ざんを検知」「検証できる事実」までOK。
- フォント Noto Sans JP、背景は §1 のダークグラデ。

### 3.3 図で「描いてよい / 描いてはいけない」
| ✅ 描いてOK | ❌ 描かない（特許/機密） |
|---|---|
| 5ステップの流れ（記録→照合→確定→刻む→見せる） | メタアンカーの**集約機構**・VIN横断で履歴を束ねる図・単一トランザクション（特許01） |
| 「ハッシュをブロックチェーンに刻む」を抽象アイコン（鍵/シールド/ブロック）で | AIの**判定アルゴリズム**・写真改ざん検出の内部カスケード（特許02） |
| 「改ざんを検知」「検証できる事実」 | 自動化の内部制御（確信度ゲート等・特許03） |
| RFC3161・署名・LINE確認を語として | 車両パスポートの将来像・全履歴集約のビジュアル（特許01・出願前） |

---

## 4. 記事ヒーロー / サムネ

- 現状 `news/[slug]/page.tsx` は `ArticleHero`（`seed`=slug から手続き的に生成する抽象アート、aspect 5/2）。
- 本リリースは重要なので **専用ヒーロー** を推奨：上記フロー図 or その一部をトリミングして `aspect 5/2` に。差し替えるなら `ArticleHero` を画像対応にする小改修か、本文先頭に画像を置く。

---

## 5. 書き出しサイズ一覧（SNS・媒体）

| 用途 | サイズ | 備考 |
|---|---|---|
| OGP（FB/LINE/汎用） | 1200×630 | `makeOgImage` 準拠 |
| X（Twitter）大カード | 1600×900（16:9） | OGと別に最適化推奨 |
| LinkedIn 共有 | 1200×627 | 投資家・損保に効く |
| Instagram 正方形 / 縦 | 1080×1080 / 1080×1350 | 任意 |
| 記事ヒーロー | aspect 5/2（例 1200×480） | `ArticleHero` と同比 |
| PR TIMES 本文添付 | 横幅 ≥ 1280 推奨 | フロー図＋ファクト図 |

---

## 6. 制作チェックリスト
- [ ] §1 のトークンのみ使用（ハードコード禁止・`DESIGN_SYSTEM.md` 準拠）
- [ ] 記事別OG実装（§2.2）＋ `ogTitle`/`ogSubtitle` を frontmatter に追加（§2.3）
- [ ] 汎用 `opengraph-image.tsx` も `makeOgImage` に統一（任意・推奨）
- [ ] フロー図 §3.3 の「描かない」を厳守（特許01/02/03）
- [ ] SNSサイズ書き出し（§5）
- [ ] 文字の可読性（OGは縮小表示されるので大きめ・コントラスト確保）
