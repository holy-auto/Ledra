# design-sync notes — Ledra

## Repo shape

- This is the Ledra Next.js app itself (`holy-cert` npm package), not a
  standalone publishable component library. There is no `dist/`, no
  `package.json` `main`/`module`/`exports`. The converter runs in **synth-entry
  mode**, pointed at `src/components/ui/` via `cfg.srcDir`.
- Package manager: npm (`package-lock.json`). Node v22.22.2 in this
  environment; `@zxing/library@0.22.0` warns it wants Node >=24 (`EBADENGINE`)
  but installs and builds fine — non-blocking.

## componentSrcMap exclusions (12 of 39 files in src/components/ui/)

Excluded because they can't render standalone outside the real Next.js app
shell / data layer, not because they're low quality:

- **Next.js App Router-coupled** (`useRouter`/`usePathname`/`next/navigation`,
  or are the router-driven shell itself): `AdminTopBar`, `CommandPalette`,
  `ContextSwitcher`, `EmptyStateGuide`, `NavigationProgress`, `PageBar`,
  `Sidebar`, `SidebarShell`. (`PageHeader`, which IS included, imports
  `PageBar` internally — that's fine, `PageBar.tsx` itself only uses
  `next/link`, which bundles statically without needing router context.)
- **Direct Supabase/data-fetching components**: `NotificationBell`,
  `OrderCsvImport`.
- **Non-visual infrastructure**: `ViewerModeProvider` (data-fetching context
  provider), `MutationGuard` (role-gated visibility wrapper, renders nothing
  of its own).

Three included components read app-specific React contexts
(`BusinessModeToggle`, `StoreSelector`, `ViewModeToggle`) — verified their
context modules (`BusinessModeContext`, `StoreContext`, `ViewModeContext`)
all provide safe no-provider fallbacks in their `use*` hooks, so no
`cfg.provider` wrapper was needed.

## Tailwind v4 CSS

`src/app/globals.css` starts with `@import "tailwindcss"` — the raw file has
tokens and custom component classes (`.btn-primary` etc.) but no generated
Tailwind utility classes. `cfg.cssEntry` points at
`.design-sync/.cache/compiled.css`, produced by `.design-sync/tailwind-build.mjs`
(postcss + `@tailwindcss/postcss`) — this is `cfg.buildCmd`, re-run before
every build/re-sync.

## Fonts

App fonts are loaded via `next/font/google` (`Noto_Sans_JP`, `Geist_Mono` in
`src/app/layout.tsx`), which self-hosts at Next.js build time — there are no
static `@font-face`/woff2 files committed in the repo for the scraper to
find. **Resolved**: harvested the same two families directly from Google
Fonts (the same public source next/font itself pulls from) — TTFs live at
`.design-sync/fonts/*.ttf` + `.design-sync/fonts/fonts.css`, wired via
`cfg.extraFonts`. Only weights 400/500 for Noto Sans JP (DESIGN_SYSTEM.md:
700 is never used) and 400 for Geist Mono. Also had to bridge the CSS custom
properties next/font injects at runtime (`--font-noto-sans`,
`--font-geist-mono`) — `cfg.tokensGlob`/`tokensPkg` only copy files out of an
npm package's own `node_modules` dir, not a repo-relative file, so instead
`.design-sync/runtime-font-vars.css` gets concatenated onto the compiled
Tailwind CSS by `.design-sync/tailwind-build.mjs` directly.

**Yu Mincho (`--font-serif`) stays unresolved on purpose** — verified (grep
across the whole repo, not just `src/components/ui/`) there is no woff2/ttf
for it anywhere; the real app's own `--font-serif` stack
(`"Yu Mincho", "YuMincho", "游明朝", "Hiragino Mincho ProN", "HG明朝E", serif`)
is OS-native fonts only, by design, with a generic `serif` fallback — not a
webfont next/font ever loads. The DS pane substitute (system serif) matches
production behavior exactly, so this isn't a gap to chase further.

## [TOKENS_MISSING] triage (non-blocking, confirmed benign)

`validate` flags 7 CSS vars (`--border`, `--accent-red-bg`, `--bg-primary`,
`--bg-secondary`, `--surface`, `--font-noto`, `--accent`) as referenced but
undefined. Checked: none of these appear in any of the 33 shipped
`src/components/ui/` components — they're picked up because
`.design-sync/tailwind-build.mjs` compiles `globals.css` with Tailwind's
default whole-project content scan, and these come from other app pages
(`AccountingClient.tsx`, `ShareDocumentModal.tsx`, `FeaturesClient.tsx`,
marketing/pitch pages) that reference token names which look like stale
renames — not shipped-component bugs. Safe to leave; re-verify this list on
re-sync in case a newly-included component starts using one of them for
real.

## guidelinesGlob — DO NOT remove the override (sensitive-content risk)

The default `guidelinesGlob` (`['docs/guides/**/*.md', 'docs/*.md', 'guides/**/*.md']`) matched **84 files** in this repo's `docs/` — which is the repo's general documentation folder, not a design-guidelines folder. It swept up genuinely sensitive internal material: audit reports, `CONTRACT_COMPLIANCE_REVIEW`, `disaster-recovery.md`, `incident-response-playbook.md`, `sso-setup.md`, `staging-environment.md`, `iso27001-soc2-prep.md`, competitor analysis, `toyota-negotiation-strategy.md`, `times-mobility-followup-email.md`, `brand-contacts.md`, and more. This was caught and fixed **before** any upload — `cfg.guidelinesGlob` is pinned to `"DESIGN_SYSTEM.md"` (the one file in this repo that's an actual design-system reference) specifically to prevent this. **Never delete this override or let a re-sync fall back to the default** — re-check `docs/` for anything newly matching a broadened glob before ever widening this.

## Bundling gotchas (already fixed, recorded so a re-sync doesn't rediscover them)

- **synth-entry mode's default `export * from <every .tsx under srcDir>`
  doesn't work for this repo.** Two problems: (1) it has no way to exclude
  the componentSrcMap-`null` files from the bundle itself — only from
  discovery — so `Sidebar.tsx`'s `next/image` import evaluated
  `process.env.__NEXT_IMAGE_OPTS` at module top level and crashed the whole
  IIFE before anything reached `window.Ledra`; (2) almost every component in
  this repo is `export default function Name()`, and `export *` never
  re-exports a module's default export, so even a clean build left
  `window.Ledra` with only the handful of components using a bare named
  export. Fixed by hand-generating the bundle entry
  (`.design-sync/entry-build.mjs`, wired via `cfg.buildCmd` and passed with
  `--entry .design-sync/.cache/entry.mjs`): one `export { default as Name }
  from "<abs path>"` (or `export { Name } from …` when the file has no
  default) per `componentSrcMap`-included component only.
- `Toast.tsx` has no export literally named `Toast` — only `ToastProvider`
  and the `useToast` hook. `componentSrcMap` uses `"ToastProvider"`, not
  `"Toast"`.
- `PageHeader` was dropped from the included set (not just `PageBar`,
  `Sidebar`, etc.) because it imports the excluded `PageBar` internally
  (`next/link`) — keeping it would pull `next/link` back into the curated
  entry as a genuine transitive dependency.

## Re-sync risks

- If `src/components/ui/` gains new files, `componentSrcMap` needs new
  entries (either pinned-in or explicitly excluded) — nothing is
  auto-included/excluded by convention alone.
- `.design-sync/.cache/compiled.css` is regenerated by `buildCmd` — if
  Tailwind's content-detection scope ever changes (e.g. globals.css content
  globs), utility classes used only by non-`ui/` app code could leak in or
  drop out; not currently pinned to `src/components/ui/**` specifically.
- The three context-dependent components render their **no-provider
  fallback** state in previews (e.g. `StoreSelector` with an empty store
  list) — this is correct/intentional, not a bug to fix.
