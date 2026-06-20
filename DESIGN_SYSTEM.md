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

| Token                | Light     | Dark                    |
| -------------------- | --------- | ----------------------- |
| `--bg-base`          | `#f5f5f7` | `#060a12`               |
| `--bg-surface-solid` | `#ffffff` | `#0d1525`               |
| `--text-primary`     | `#1d1d1f` | `#ffffff`               |
| `--text-secondary`   | `#6e6e73` | `rgba(255,255,255,0.5)` |
| `--accent-blue`      | `#0071e3` | (same)                  |

### Font

| Token          | Value                    |
| -------------- | ------------------------ |
| `--font-sans`  | Noto Sans JP + fallbacks |
| `--font-serif` | Yu Mincho + fallbacks    |
| `--font-mono`  | Geist Mono               |

### Radius

`--radius-sm` (8px) / `--radius-md` (12px) / `--radius-lg` (16px) / `--radius-xl` (20px) / `--radius-full`

### Shadow

`--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl` / `--shadow-focus`

---

## Components (`src/components/ui/`)

| Component       | File                | Purpose                                                                        |
| --------------- | ------------------- | ------------------------------------------------------------------------------ |
| `Button`        | `Button.tsx`        | Variants: primary/secondary/ghost/danger/outline. Sizes: sm/md/lg              |
| `Badge`         | `Badge.tsx`         | Status pills. Variants: default/success/warning/danger/info/violet             |
| `Card`          | `Card.tsx`          | Surface container. Variants: default(glass)/elevated/inset                     |
| `Input`         | `Input.tsx`         | Text input with error state                                                    |
| `Select`        | `Select.tsx`        | Select dropdown with error state                                               |
| `Textarea`      | `Textarea.tsx`      | Multi-line input                                                               |
| `FormField`     | `FormField.tsx`     | Label + input + hint + error wrapper                                           |
| `SectionTag`    | `SectionTag.tsx`    | Uppercase monospace section label                                              |
| `StatCard`      | `StatCard.tsx`      | Dashboard metric card                                                          |
| `EmptyState`    | `EmptyState.tsx`    | No-data placeholder                                                            |
| `Skeleton`      | `Skeleton.tsx`      | Loading placeholder                                                            |
| `Modal`         | `Modal.tsx`         | Dialog overlay                                                                 |
| `Drawer`        | `Drawer.tsx`        | Slide-in panel                                                                 |
| `Toast`         | `Toast.tsx`         | Notification system (with `ToastProvider`, `useToast`)                         |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive action confirmation                                                |
| `DataTable`     | `DataTable.tsx`     | Structured table with selection/sorting                                        |
| `Accordion`     | `Accordion.tsx`     | Expandable sections                                                            |
| `PageHeader`    | `PageHeader.tsx`    | Page title area. `tag` + `title` + optional `meta` + `description` + `actions` |
| `Tabs`          | `Tabs.tsx`          | タブ切替。下線=テキスト幅整合 / 件数バッジ=アクティブ塗り・非アクティブ枠線    |
| `Pagination`    | `Pagination.tsx`    | Page navigation                                                                |
| `Sidebar`       | `Sidebar.tsx`       | App navigation                                                                 |

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
- アクティブ下線は **テキスト幅に整合**（padding と同じ 12px インセット）。
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
