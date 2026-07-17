# Ledra Design System — conventions

Ledra is a Web-based 施工証明書 (work-completion certificate) SaaS connecting auto body shops, insurers, and customers. The app side (`/my`, `/agent`, `/insurer`, `/admin`) is light-themed and functional; the marketing site is dark-themed and editorial. These components are the **app-side, light-theme** UI kit.

## Setup

No provider wrapper is required for any component in this kit — every component that reads shared app state (`BusinessModeToggle`, `StoreSelector`, `ViewModeToggle`) falls back to a safe default when rendered without one. Build freely without wrapping in anything.

The one real provider is **`ToastProvider`** — wrap a page/section in it to enable toast notifications, then call `useToast()` from a descendant to fire one:

```tsx
const { ToastProvider, useToast, Button } = window.Ledra;

function SaveButton() {
  const { toast } = useToast();
  return <Button onClick={() => toast("保存しました", "success")}>保存</Button>;
}

function Page() {
  return (
    <ToastProvider>
      <SaveButton />
    </ToastProvider>
  );
}
```

`toast(message, variant)` — `variant` is `"success" | "error" | "warning" | "info"`.

Fonts (Noto Sans JP for UI, Geist Mono for numbers/IDs) are shipped as real `@font-face` files with this kit — no separate font setup needed.

## Styling idiom

Two layers, both token-driven (no hardcoded hex anywhere in the source):

**1. Component classes** — most components carry their own class and need no extra styling:

| Class | Use |
|---|---|
| `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-danger` / `btn-outline` | Button variants (also on any raw `<button>`) |
| `glass-card` | Frosted-glass surface (Card `default`/`elevated`) |
| `dark-card` | Dark surface variant |
| `input-field` / `select-field` | Text input / select chrome (append `is-error` class for the error state) |
| `section-tag` | Uppercase monospace section label |
| `skeleton` | Loading-placeholder pulse |
| `.text-display` `.text-h1` `.text-h2` `.text-h3` `.text-body` `.text-small` `.text-micro` | Type ramp — pick by role, never set `font-size` directly |

**2. Tailwind utilities + CSS custom properties** for layout and one-off styling — spacing/flex/grid utilities are plain Tailwind (`flex`, `gap-3`, `grid-cols-2`, `p-5`, …); anything color/radius/shadow goes through a token via Tailwind's arbitrary-value syntax, e.g. `bg-[var(--bg-surface-solid)]`, `border-[var(--border-default)]`, `text-[var(--accent-blue)]`. Never write a raw hex value.

**Important: `styles.css` is a static, pre-compiled snapshot, not a live Tailwind build.** Only utility classes already used somewhere in this kit's shipped components exist in it — a class you invent that wasn't already in use (e.g. `gap-11`, `p-9`, an arbitrary-value combo no component happens to use) has no generated rule and silently renders unstyled. Verified-present spacing steps for `gap-*`/`p-*`/`m-*`/`space-*`: `0 1 2 3 4 5 6 8 10 12` (steps `7 9 11` and anything above `12` are NOT shipped — use the nearest present step instead). When in doubt, reuse a spacing value you can see in one of this kit's own `.prompt.md` examples rather than picking an arbitrary number.

Key tokens (see `styles.css` for the full set): `--bg-base`, `--bg-surface-solid`, `--bg-elevated`, `--bg-inset`, `--text-primary`, `--text-secondary`, `--text-ink2`, `--text-muted`, `--accent-blue` (primary accent), `--accent-gold` (reserve for certificates / blockchain-anchor moments only — see `AnchorBadge` — never as a general accent), `--radius-sm|md|lg|xl|full`, `--shadow-sm|md|lg|xl|focus`, `--border-default`, `--border-subtle`.

Font weight: Noto Sans JP UI text stays at 400/500; 600 only on `.text-h2`/`.text-h3`/`.text-micro`-level headings. **Never use weight 700** — it's an intentional house rule (bold reduces density/refinement in this system).

## Where the truth lives

- `styles.css` (imports `_ds_bundle.css` + `fonts/fonts.css`) — the full compiled stylesheet, tokens, and every class above. Read it before styling anything non-trivial.
- Each component's own `<Name>.prompt.md` — real prop shapes and composed examples ported from this kit's authored previews.

## Example composition

A status-labeled dashboard stat row, in the kit's own idiom:

```tsx
const { StatCard, Badge } = window.Ledra;

function DashboardSummary() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard label="今月の発行件数" value="128件" caption="前月比 +12%" />
      <StatCard
        label="保留中の証明書"
        value={<Badge variant="warning">3件・要対応</Badge>}
      />
    </div>
  );
}
```
