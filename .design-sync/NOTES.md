# design-sync notes — Ledra

## Repo shape

- This is the Ledra Next.js app itself (`holy-cert` npm package), not a
  standalone publishable component library. There is no `dist/`, no
  `package.json` `main`/`module`/`exports`. The converter runs in **synth-entry
  mode**, pointed at `src/components/ui/` via `cfg.srcDir`.
- Package manager: npm (`package-lock.json`). Node v22.22.2 in this
  environment; `@zxing/library@0.22.0` warns it wants Node >=24 (`EBADENGINE`)
  but installs and builds fine — non-blocking.

## componentSrcMap exclusions (14 of 46 files in src/components/ui/)

Excluded because they can't render standalone outside the real Next.js app
shell / data layer, not because they're low quality:

- **Next.js App Router-coupled** (`useRouter`/`usePathname`/`next/navigation`,
  or are the router-driven shell itself): `AdminTopBar`, `CommandPalette`,
  `ContextSwitcher`, `EmptyStateGuide`, `NavigationProgress`, `PageBar`,
  `Sidebar`, `SidebarShell`. `PageHeader` is ALSO excluded (not included) —
  it imports `PageBar` internally, so keeping it would pull `next/link` back
  into the curated bundle entry as a transitive dependency (see "Bundling
  gotchas" below).
- **Direct Supabase/data-fetching components**: `NotificationBell`,
  `OrderCsvImport`, `StoreSelector` (added in Codex round 2 — see below).
- **Non-visual infrastructure**: `ViewerModeProvider` (data-fetching context
  provider), `MutationGuard` (role-gated visibility wrapper, renders nothing
  of its own).

Two included components read app-specific React contexts
(`BusinessModeToggle`, `ViewModeToggle`) — verified their context modules
(`BusinessModeContext`, `ViewModeContext`) provide safe no-provider
fallbacks in their `use*` hooks (full visual renders, just non-interactive
without a real provider), so no `cfg.provider` wrapper was needed.
`StoreSelector` also reads a context (`StoreContext`) but its fallback is
`return null` — excluded instead, see "Codex round 2" below.

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
Fonts (the same public source next/font itself pulls from) — WOFF2 files
(converted from the originally-harvested TTFs via `ttf2woff2`, see "Codex
round 5") live at `.design-sync/fonts/*.woff2` + `.design-sync/fonts/fonts.css`,
wired via `cfg.extraFonts`. Weights 400/500/700 for Noto Sans JP (matches
`src/app/layout.tsx`'s own `next/font` weight array — see "Codex round 3"
below for why 700 was added after an earlier wrong "never used" claim) and
400/600 for Geist Mono. Also had to bridge the CSS custom
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

## Codex review findings on PR #760 (fixed)

- **`border-border` / `border-divider` are dead classes — pre-existing bugs in real app source, not sync artifacts.** `globals.css`'s `@theme` block only defines `--color-border-default`/`-subtle`/`-strong` (compound names), never a bare `--color-border` or `--color-divider`, so Tailwind never generates `.border-border`/`.border-divider` — these render as no-op (default `currentColor` border) in production too, not just in the synced bundle. Fixed the 3 sync-included components that used them: `FloatingField.tsx` (`border-border` → `border-border-default`), `InspectionSignaturePad.tsx` (3 occurrences: header/footer dividers → `border-border-subtle` matching Modal/Drawer's own footer-divider pattern, drop-zone → `border-border-default`), `Pagination.tsx` (5× `border-divider` → `border-border-default`). **The same bug exists in ~20 other app files outside this sync's scope** (`OrderCsvImport.tsx`, `ReservationsClient.tsx`, `OrdersClient.tsx`, `HearingClient.tsx`, `BrandingHearingClient.tsx`, and more) — left alone as a separate pre-existing cleanup, not fixed here to avoid scope creep in a design-sync PR.
- **Geist Mono shipped only weight 400, but `.section-tag` needs 600.** `globals.css`'s `.section-tag` sets `font-weight: 600` with `font-family: var(--font-mono)`; only having a 400 TTF meant browsers synthesized/faked bold. Added a real weight-600 `@font-face` (same Google Fonts source as the others) — `.design-sync/fonts/geist-mono-600.ttf` + `fonts.css` entry.
- **`.d.ts` contracts for `Input`/`Textarea`/`Select`/`Button`/`Card` dropped all inherited native HTML attributes.** These components `extends *HTMLAttributes<...>` and spread `{...props}`, but `cfg.dtsPropsFor` only supplies the interface *body* (no `extends` clause support), so the emitted contract only showed the custom fields (e.g. `Input` looked like it only accepted `error?: boolean`). Inlined the commonly-used native attributes (`value`, `onChange`, `placeholder`, `disabled`, `className`, etc.) directly into each `dtsPropsFor` body as an explicit, documented addition.
- **`Accordion`/`Stepper`/`CustomerRankBadge` referenced private, non-exported types** (`AccordionItem`, `StepItem`, `RankLike`) in their `dtsPropsFor` bodies — those types aren't in the emitted `.d.ts` tree (synth-entry mode only has real component exports), so the reference was dangling. Inlined the actual shape (`{ question: string; answer: string }` etc.) instead of referencing the type name.
- **conventions.md didn't warn that `styles.css` is a static compiled snapshot**, not a live Tailwind build — an arbitrary utility class (`gap-11`, `p-9`) that no shipped component happens to use has no generated rule and silently renders unstyled. Added an explicit warning + the verified-present spacing steps to the conventions header.

## Codex round 2 (after the round-1 fixes above — also fixed)

- **Round-1 type-inlining was incomplete**: `Badge`/`Button`/`Card` still referenced `BadgeVariant`/`ButtonVariant`/`ButtonSize`/`CardVariant`, and `FirstUseInlineGuide`/`HelpTooltip`/`AnchorBadge`/`DashboardWidgets`/`Timeline` still referenced `Step`/`Side`/`PolygonNetwork`/`Widget`/`TimelineItem` — all private, non-exported types with the same dangling-reference problem as round 1's `AccordionItem`/`StepItem`/`RankLike`. Inlined every one of these too (unions and object shapes both).
- **Round-1's native-attribute fix was still a hand-picked, necessarily-incomplete subset** (e.g. `Input`'s authored preview passes `aria-label` in `.design-sync/previews/Select.tsx`/`Textarea.tsx`, which wasn't in the round-1 list). `cfg.dtsPropsFor` genuinely cannot express an `extends` clause, so instead of chasing an ever-growing enumeration, added `[key: string]: unknown` with an explanatory comment to `Input`/`Textarea`/`Select`/`Button`/`Card` — this honestly signals "additional native attributes (aria-*, data-*, etc.) also pass through" without pretending the named list is exhaustive.
- **`StoreSelector` excluded from the sync.** Unlike `BusinessModeToggle`/`ViewModeToggle` (which render their full visual from a safe context default), `StoreSelector` has `if (loading || stores.length <= 1) return null;` and the context default is `loading: true` forever with no provider — it renders **nothing** standalone, not degraded-but-visible. Its real `StoreProvider` (`src/lib/stores/StoreContext.tsx`) also wouldn't help: it `fetch()`es `/api/admin/stores`, which fails/404s with no backend, still leaving `stores.length <= 1`. Same category as the already-excluded `NotificationBell`/`OrderCsvImport` (data-layer-coupled, can't render standalone) — moved to `componentSrcMap: null`.
- **Missing OFL license notices for the redistributed fonts.** Noto Sans JP and Geist Mono are both SIL Open Font License 1.1, which requires the license + copyright notice to travel with redistributed copies. Fetched the real `OFL.txt` for each family verbatim from the `google/fonts` source repo → `.design-sync/fonts/OFL-NotoSansJP.txt` / `OFL-GeistMono.txt`. **These are NOT copied into `ds-bundle/fonts/` automatically** — `package-build.mjs`'s font handling only copies files referenced via `url()` inside `@font-face` rules, never companion license text. (Originally required running a separate `copy-font-licenses.mjs` script after `package-build.mjs`; superseded in round 3 below by folding this into `rebuild.mjs`.)
- **conventions.md's spacing-step claim was wrong for `m-*`/`space-x-*`** — the round-1 fix asserted a single `0 1 2 3 4 5 6 8 10 12` list covering `gap-*`/`p-*`/`m-*`/`space-*`, but only verified it against `gap-*`/`p-*`. Actual verified sets differ a lot per family (e.g. `m-*` only has `0 1 2 3 6`, `space-x-*` only has `3`). Replaced with a per-family table, each verified independently.

## Codex round 3 (after the round-2 fixes above — also fixed)

- **Noto Sans JP weight 700 actually is used, contradicting the round-1 claim it "is never used."** That claim was only ever verified against DESIGN_SYSTEM.md's named type-ramp classes (`.text-h1` etc.), never against raw Tailwind utility usage. Grepped the whole `src/components/ui/` tree for `font-bold` and found three shipped, sync-included components using it directly: `FirstUseInlineGuide.tsx:109`, `HelpTooltip.tsx:67`, `Stepper.tsx:94` — plus `src/app/layout.tsx` itself loads `next/font/google` with `weight: ["400", "500", "700"]`, confirming the real app ships 700 too. Fetched `.design-sync/fonts/noto-sans-jp-700.ttf` from the same Google Fonts source as the other weights, added the matching `@font-face` block to `fonts.css`, and corrected the header comment (no more "never used" claim).
- **The font-license copy step (round 2) was never actually wired to anything** — `copy-font-licenses.mjs` existed but nothing in the documented rebuild flow called it, so a normal re-sync would silently ship fonts without their required OFL notices, the exact "looks done, isn't" failure mode this log exists to prevent. Fixed by creating `.design-sync/rebuild.mjs`, the single canonical rebuild command: runs `tailwind-build.mjs` → `entry-build.mjs` → `package-build.mjs` → copies both OFL `.txt` files into `<out>/fonts/`, in one script (`node .design-sync/rebuild.mjs <out-dir>`). Deleted the now-redundant standalone `copy-font-licenses.mjs` — its logic lives inline in `rebuild.mjs`'s step 4 instead. Any future re-sync should invoke `rebuild.mjs`, not the individual step scripts.

## Codex round 4 (after the round-3 fixes above — also fixed)

- **`rebuild.mjs` closed the "never invoked" gap for a human who knows to run it, but nothing in `cfg` forces its use over the raw steps.** Codex's fresh finding on the round-3 commit: `cfg.buildCmd` (the one command the actual sync/upload path always runs) only ever ran `tailwind-build.mjs` + `entry-build.mjs`; `rebuild.mjs`'s license-copy step happens *after* `package-build.mjs`, so it structurally cannot be reached from `cfg.buildCmd` (the out-dir doesn't exist yet when `buildCmd` runs). A re-sync that follows the "obvious" pattern — `buildCmd` then invoke `package-build.mjs` directly — still ships fonts without their license files, exactly as before, just one layer further from discovery.
- Audited every `cfg.*` key `package-build.mjs` reads (`componentSrcMap`, `cssEntry`, `docsMap`, `dtsPropsFor`, `entry`, `extraEntries`, `extraFonts`, `globalName`, `libOverrides`, `overrides`, `pkg`, `provider`, `readmeHeader`, `replaces`, `shape`, `srcDir`, `storyImports`, `storybookConfigDir`, `storybookStatic`, `titleMap`, `tokensGlob`, `tokensPkg`, `tsconfig`) — **there is no post-build hook and no generic "copy this arbitrary file into the output" mechanism.** `cfg.extraFonts` only accepts `.css` or actual font files (`.woff2/.woff/.ttf/.otf`) — a `.txt` license file passed there hits the "isn't a css or font file — skipped" branch. Also discovered while auditing `extractFonts()` (`.ds-sync/lib/css.mjs`): the shipped `fonts.css` is **machine-regenerated from bare `@font-face{...}` rules** via regex, not a verbatim copy of the source file — every comment, including the license-pointer comment this repo's `fonts.css` carries, is silently dropped before it ever reaches `ds-bundle/`. Confirmed by inspecting an actual local build's `ds-bundle/fonts/fonts.css`: no comments, rules only. So the copied `.txt` files were the *only* thing carrying the notice, and only when `rebuild.mjs` specifically (not `buildCmd` + `package-build.mjs`) was used.
- **Fix: moved the license notice to `cfg.readmeHeader` (`.design-sync/conventions.md`) instead of relying on a raw file copy.** `readmeHeader` is the one mechanism here already proven to reliably survive into the shipped output regardless of which build path runs — added a "Font licensing" section with both families' copyright lines, the SIL OFL 1.1 declaration, and the license URL. The `fonts/*.txt` files + `rebuild.mjs`'s copy step are kept as a defense-in-depth nice-to-have (still useful if someone does run the full `rebuild.mjs`), but the conventions.md text is now the authoritative, always-shipped copy — not contingent on which script sequence a re-sync happens to invoke.

## Codex round 5 (after the round-4 fix above — also fixed)

- **`rebuild.mjs` fails with a bare `MODULE_NOT_FOUND` in a fresh checkout** — `.ds-sync/` (the design-sync skill's own converter toolchain) is gitignored and never committed, so a checkout that hasn't run the skill's setup step first has no `.ds-sync/package-build.mjs` for `rebuild.mjs` to invoke. This was always true, just newly surfaced once `rebuild.mjs` became the documented entrypoint. Not fixable by committing `.ds-sync/` itself (it's the skill's disposable staged tooling, not app code) — instead added an explicit existence check at the top of `rebuild.mjs` that fails fast with a clear pointer ("run the design-sync skill's setup step first") instead of a confusing several-steps-deep stack trace.
- **`SkeletonLines` (a real named export in `Skeleton.tsx`, alongside the default-exported `Skeleton`) was completely absent from the synced bundle.** `componentSrcMap` maps one name to one file and `entry-build.mjs` only emits one export line per entry, so a file's *second* export was simply never reached. Fixed by adding it to `entry-build.mjs`'s `EXTRA_EXPORTS` (previously only used for the non-PascalCase `useToast` hook — the mechanism works identically for a second PascalCase export sharing a file) — confirmed `window.Ledra.SkeletonLines` now resolves correctly in the built `_ds_bundle.js`. It still has no dedicated component page / `.d.ts` entry: `.ds-sync/lib/source-kit.mjs`'s component-list derivation runs off `exportedNames()` + `cfg.componentSrcMap`, not off `entry.mjs`'s actual exports, and patching that derivation lives in the same gitignored, skill-owned `.ds-sync/` as the item above — not something this repo's config can reach. Documented `SkeletonLines`'s existence and prop shape directly in `conventions.md` instead (the same treatment `useToast` already gets), so the design agent can discover and use it even without a generated page.
- **The `readmeHeader` license notice (round 4) still wasn't OFL-compliant** — it linked to the license instead of containing it, and the OFL's own redistribution terms (condition 2 in `OFL-NotoSansJP.txt`) require every copy to contain "the above copyright notice and this license" — a URL isn't a copy. Fixed by reproducing the full OFL 1.1 text verbatim in `conventions.md` (identical body for both families — diffed the two `OFL-*.txt` files to confirm only the copyright line and FAQ URL differ) alongside both copyright lines.
- **Noto Sans JP TTFs were large (~5.3MB × 3 weights ≈ 15.9MB) with no compression**, unlike the real app's `next/font/google` delivery (WOFF2 + Unicode-range subsets). Converted every shipped font (Noto Sans JP × 3, Geist Mono × 2) from TTF to WOFF2 via `ttf2woff2` — same glyph coverage, ~55-65% smaller (measured: Noto Sans JP 5.3MB→2.2MB per weight, Geist Mono 71KB→26KB per weight; fonts/ dropped from ~16MB to ~6.5MB). **Did not attempt Unicode-range subsetting** — ponytail: full CJK subsetting needs a tool this environment doesn't have installed (fontTools/pyftsubset) and carries real risk of silently dropping glyphs a later design actually needs, which is worse than a slower load for a design-preview tool; WOFF2 alone captures most of the win with zero coverage risk. Upgrade path if bundle size becomes a real problem: add `fonttools` and subset to the Unicode ranges actually used by shipped components' Japanese copy.

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
