# Ledra Design System

## Overview

LedraのHP（マーケティング）とアプリ（ダッシュボード）を「同じブランドの別モード」として統一するデザインシステム。

- **HP**: ダークテーマ・演出的・CV重視
- **アプリ**: ライトテーマ・機能的・業務効率重視
- **共通**: カラー・角丸・スペーシング・フォント・ボーダー・状態設計

---

## Design Tokens

トークンは `src/app/globals.css` の `:root` で定義。マーケティングは `[data-theme="dark"]` で上書き。

### Color

| Token                | Light     | Dark                     |
| -------------------- | --------- | ------------------------ |
| `--bg-base`          | `#f5f5f7` | `#060a12`                |
| `--bg-surface-solid` | `#ffffff` | `#0d1525`                |
| `--text-primary`     | `#1d1d1f` | `#ffffff`                |
| `--text-secondary`   | `#424247` | `rgba(255,255,255,0.95)` |
| `--text-ink2`        | `#555560` | —                        |
| `--text-muted`       | `#6e6e73` | `rgba(255,255,255,0.85)` |
| `--accent-blue`      | `#0071e3` | `#4d9fff`                |
| `--accent-gold`      | `#b08d3f` | (same)                   |

**Text の階段:** `primary (#1d1d1f)` → `ink2 (#555560)` → `secondary (#424247)`〜`muted (#6e6e73)`。`--text-ink2` は見出し補助・メタ情報用の中間階調（白背景比 ≈ 7.5:1 で AA 維持）。2番手テキストが沈むのを防ぐ用途に使う。

#### Accent — Gold（差し色）

`--accent-gold (#b08d3f)` / `--accent-gold-dim` / `--accent-gold-text (#7a5d28)` は **UI アクセント専用の新設トークン**。Apple Blue を主アクセントに据えたまま、「信頼と格式」の文脈にだけ Gold を差す。**全面ゴールド化はしない。** 使用は年に数回しか目にしない“特別な瞬間”に限定：

- 証明書（PDF / 詳細）のヘッダ罫線・シール周り
- 料金プランの章扉、insurer ロールの公式ラベル
- ブロックチェーン・アンカー成功表示（AnchorBadge）— Gold 差し色の主用途

Tailwind 経由では `accent-gold` / `accent-gold-dim` / `accent-gold-text` として参照可。

### Font

| Token          | Value                    |
| -------------- | ------------------------ |
| `--font-sans`  | Noto Sans JP + fallbacks |
| `--font-serif` | Yu Mincho + fallbacks    |
| `--font-mono`  | Geist Mono               |

### Radius

`--radius-sm` (6px) / `--radius-md` (10px) / `--radius-lg` (14px) / `--radius-xl` (18px) / `--radius-full`

editorial な落ち着き＝高級感のため各段を一段締めている。割り当て: chips/小ボタン = sm(6) / Button・Input = md(10) / Card = lg(14) / Modal・glass-card = xl(18)。トークン経由で波及するため個別指定は不要。

### Type Ramp

見出しは下記7段に揃える。`globals.css` の `.text-*` ユーティリティで提供（色は別途指定）。

| role    | class           | size / line-height / weight / tracking | 用途                |
| ------- | --------------- | -------------------------------------- | ------------------- |
| display | `.text-display` | 48 / 1.05 / 500 / −0.03em              | HP のみ             |
| h1      | `.text-h1`      | 32 / 1.15 / 500 / −0.02em              | ページタイトル      |
| h2      | `.text-h2`      | 22 / 1.3 / 600 / −0.01em               | セクション見出し    |
| h3      | `.text-h3`      | 17 / 1.4 / 600 / 0                     | カード見出し        |
| body    | `.text-body`    | 14 / 1.6 / 400                         | 本文                |
| small   | `.text-small`   | 12.5 / 1.5 / 400                       | 補足                |
| micro   | `.text-micro`   | 11 / 1.4 / 600 / 0.16em uppercase      | section-tag / label |

### Font Roles（書体の使い分け）

- **Sans（Noto Sans JP）= ほぼ全 UI。** 本文・UI は weight 400 / 500 を基本とし、**見出し（`.text-h2` / `.text-h3` / `.text-micro` など Type ramp で 600 指定の段）に限り 600 まで許容**。**700 は使わない**（太字は密度を下げる）。
- **Serif（Yu Mincho / Noto Serif JP）= 信頼と格式の場面に限定:** ①証明書 PDF ②料金プラン章扉 ③insurer / 会社情報の公式ラベル ④HP 大見出し。**日常 UI には入れない**（これを守ることが高級感の源泉）。
- **Mono（Geist Mono）= 数値と識別子:** 金額・ID・SKU・ハッシュ・日時はすべて mono、`font-variant-numeric: tabular-nums` 常時オン（絶対ルール #4 の徹底）。

### Shadow

`--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl` / `--shadow-focus`

---

## Components (`src/components/ui/`)

| Component       | File                | Purpose                                                                                  |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `Button`        | `Button.tsx`        | Variants: primary/secondary/ghost/danger/outline. Sizes: sm/md/lg                        |
| `Badge`         | `Badge.tsx`         | Status pills. Variants: default/success/warning/danger/info/violet                       |
| `Card`          | `Card.tsx`          | Surface container. Variants: default(glass)/elevated/inset                               |
| `Input`         | `Input.tsx`         | Text input with error state                                                              |
| `Select`        | `Select.tsx`        | Select dropdown with error state                                                         |
| `Textarea`      | `Textarea.tsx`      | Multi-line input                                                                         |
| `FormField`     | `FormField.tsx`     | Label + input + hint + error wrapper                                                     |
| `SectionTag`    | `SectionTag.tsx`    | Uppercase monospace section label                                                        |
| `StatCard`      | `StatCard.tsx`      | Dashboard metric card                                                                    |
| `EmptyState`    | `EmptyState.tsx`    | No-data placeholder                                                                      |
| `Skeleton`      | `Skeleton.tsx`      | Loading placeholder                                                                      |
| `Modal`         | `Modal.tsx`         | Dialog overlay                                                                           |
| `Drawer`        | `Drawer.tsx`        | Slide-in panel                                                                           |
| `Toast`         | `Toast.tsx`         | Notification system (with `ToastProvider`, `useToast`)                                   |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive action confirmation                                                          |
| `DataTable`     | `DataTable.tsx`     | Structured table with selection/sorting                                                  |
| `Accordion`     | `Accordion.tsx`     | Expandable sections                                                                      |
| `PageHeader`    | `PageHeader.tsx`    | Page title area. `tag` + `title` + optional `meta` + `description` + `actions`           |
| `Tabs`          | `Tabs.tsx`          | タブ切替。下線=テキスト幅整合 / 件数バッジ=アクティブ塗り・非アクティブ枠線              |
| `Pagination`    | `Pagination.tsx`    | Page navigation                                                                          |
| `Sidebar`       | `Sidebar.tsx`       | App navigation                                                                           |
| `AnchorBadge`   | `AnchorBadge.tsx`   | ブロックチェーン記録バッジ（TX hash + Polygonscan リンク・Gold 差し色）。未記録時は null |
| `Stepper`       | `Stepper.tsx`       | ウィザード進捗インジケータ（汎用・表示専用。done/current/upcoming）                      |
| `Timeline`      | `Timeline.tsx`      | 縦型タイムライン（工程履歴・汎用）                                                       |
| `PhotoCompare`  | `PhotoCompare.tsx`  | 施工前後の対比（スライダー / 並列トグル）                                                |

### Status Maps (`src/lib/statusMaps.ts`)

Centralized status-to-badge-variant mappings:

- `CERTIFICATE_STATUS_MAP`
- `NFC_STATUS_MAP`
- `DOCUMENT_STATUS_MAP`
- `INVOICE_STATUS_MAP`
- `getStatusEntry(map, status)` — safe lookup

---

## CSS Classes (`globals.css`)

| Class                                         | Use                         |
| --------------------------------------------- | --------------------------- |
| `.glass-card`                                 | App card with backdrop blur |
| `.dark-card`                                  | Marketing dark card         |
| `.btn-primary/secondary/ghost/danger/outline` | Button variants             |
| `.input-field`                                | Form input                  |
| `.select-field`                               | Form select                 |
| `.section-tag`                                | Uppercase monospace label   |
| `.skeleton`                                   | Loading pulse               |

### Button Size Modifiers

`data-size="sm"` / `data-size="lg"` on any `.btn-*` class.

---

## Navigation (L-Shell)

サイドバー + ページ見出し + タブの統一規約（WORKSTREAM B）。

### PageHeader の構成

`tag`（micro ラベル）/ `title`（一次識別子: ID だけ / 名称だけ / ID+名称）/ `meta`（任意・title 右の補助情報＝StatusBadge・件数・所属・納期）/ `description` / `actions`（ページ固有操作・右端）。

- **title + meta は `inline-flex { gap: 10px }` のクラスタにまとめる。** 負マージン（`marginLeft: -8` 等）でのにじり寄せは禁止。
- `actions` は最大 3 つ + 主アクション 1 つ。**1 画面に主アクションは 1 つ**。

### Tabs の意味論（混在させない）

| 種別               | 出る場所   | 例                                 | バッジ                  |
| ------------------ | ---------- | ---------------------------------- | ----------------------- |
| ステータスフィルタ | 一覧ページ | 全て・発行待ち・検収中・公式・完了 | 件数。順序=処理フロー順 |
| セクション切替     | 詳細ページ | 概要・工程・見積・写真・メモ       | 子要素数。順序=重要度   |

- 件数バッジ（`count`）は **アクティブ=黒塗り / 非アクティブ=アウトライン**。アクティブだけが浮き上がる。
- アクティブ下線は **ラベル文字幅に整合**（badge を含めず label span にアンカー）。
- 件数ではなくアラート等の特別表示が要る場合のみ `badge`（任意要素）で差し替える。

### L3 クローム適用メモ（5 Fix）

handoff の確定 5 Fix のうち、本リポに該当クロームが存在するもののみ適用：

- **Fix 1（title+meta クラスタ・負マージン排除）** → `PageHeader.meta` で実装。
- **Fix 2（下線をテキスト幅に整合）** / **Fix 4（非アクティブ badge アウトライン化）** → `Tabs` に内蔵。
- **Fix 3（二段グローバルバー）** / **Fix 5（ダッシュボードの「新規入庫」CTA 撤去）** → 当該クローム（細グローバルバー・該当 CTA）が現リポに存在しないため **N/A**。導入時に本節へ追記する。

> CmdK（検索）幅は将来一元化する場合 `CMDK_W = { default: 320, compact: 260 }` を基準にする（現状の CommandPalette はモーダル中央表示で別系統）。

---

## Absolute Rules

1. **Never** use `alert()`, `confirm()`, `prompt()` — use Modal/ConfirmDialog/Toast
2. **Never** hardcode hex colors — use tokens
3. **Never** create new badge/status components — extend Badge + statusMaps
4. **Never** use `font-sans` for IDs/codes — use `font-mono`
5. **Never** animate app elements on scroll — scroll animation is HP-only
6. **Never** use `!important` in Tailwind classes
7. **Always** provide empty state for lists/tables
8. **Always** provide loading skeleton matching real content shape
9. **Always** use `.section-tag` for uppercase labels in detail pages
10. **Always** use `FormField` wrapper for form inputs

---

## Design Review Checklist

- [ ] No hardcoded color values
- [ ] No `!important` overrides
- [ ] No inline `style={}` for design properties
- [ ] Empty state uses EmptyState component
- [ ] Loading state uses Skeleton
- [ ] Status badges use statusMaps
- [ ] Buttons use proper size variants
- [ ] Forms use FormField wrapper
- [ ] Destructive actions use ConfirmDialog
- [ ] Icons: Heroicons outline, 18x18, strokeWidth 1.5
- [ ] `font-mono` for IDs/codes/technical data
