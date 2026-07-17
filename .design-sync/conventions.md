# Ledra Design System — conventions

Ledra is a Web-based 施工証明書 (work-completion certificate) SaaS connecting auto body shops, insurers, and customers. The app side (`/my`, `/agent`, `/insurer`, `/admin`) is light-themed and functional; the marketing site is dark-themed and editorial. These components are the **app-side, light-theme** UI kit.

## Setup

No provider wrapper is required for any component in this kit. `BusinessModeToggle` and `ViewModeToggle` read shared app state but render their full visual (dropdown / pill toggle) from a safe default (`mode: "all"` / `"admin"`) when no provider is present — clicking them is inert without one (the setter is a no-op), but they're never invisible, which is what matters for composing a design. Build freely without wrapping in anything.

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

`SkeletonLines` (from the same file as `Skeleton`) is also on `window.Ledra` — it has no dedicated page in this kit since it's a second export sharing `Skeleton`'s file, but it renders fine: `<SkeletonLines lines={4} />` stacks `lines` skeleton bars (default `3`) for a loading text block.

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

**Important: `styles.css` is a static, pre-compiled snapshot, not a live Tailwind build.** Only utility classes already used somewhere in this kit's shipped components exist in it — a class you invent that wasn't already in use has no generated rule and silently renders unstyled. Verified-present steps, per family (anything not listed is NOT shipped — use the nearest present step instead):

| Family | Present steps |
|---|---|
| `gap-*` | `0 1 2 3 4 5 6 8 10 12` |
| `p-*` | `0 1 2 3 4 5 6 7 8 10 12` |
| `m-*` | `0 1 2 3 6` |
| `space-x-*` | `3` |
| `space-y-*` | `0 1 2 3 4 5 6 8 10 12 14 16 20` |

When in doubt, reuse a spacing value you can see in one of this kit's own `.prompt.md` examples rather than picking an arbitrary number — that's always guaranteed to exist.

Key tokens (see `styles.css` for the full set): `--bg-base`, `--bg-surface-solid`, `--bg-elevated`, `--bg-inset`, `--text-primary`, `--text-secondary`, `--text-ink2`, `--text-muted`, `--accent-blue` (primary accent), `--accent-gold` (reserve for certificates / blockchain-anchor moments only — see `AnchorBadge` — never as a general accent), `--radius-sm|md|lg|xl|full`, `--shadow-sm|md|lg|xl|focus`, `--border-default`, `--border-subtle`.

Font weight: Noto Sans JP UI text stays at 400/500; 600 only on `.text-h2`/`.text-h3`/`.text-micro`-level headings. **Never use weight 700** — it's an intentional house rule (bold reduces density/refinement in this system).

## Font licensing

Both shipped font families are SIL Open Font License 1.1 — redistribution requires the copyright + full license text to travel with the files. This section is the authoritative, always-shipped copy (`fonts.css` is machine-regenerated from bare `@font-face` rules and cannot carry a comment; a raw file copy alongside the fonts isn't reliably invoked by every build path — see NOTES.md's "Codex round 4"):

- **Noto Sans JP** — Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'
- **Geist Mono** — Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)

Both are licensed under the following (identical for both families, reproduced verbatim from each family's own `OFL.txt`):

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded, 
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

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
