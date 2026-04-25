# Dependency security policy

## Status

- **CI gate**: `npm audit --audit-level=high --omit=dev` (in `.github/workflows/ci.yml`).
  Any **high** or **critical** advisory in production deps fails the build.
- **Moderate / low** are tracked here with explicit risk assessment, then
  upgraded opportunistically (Dependabot or quarterly review).
- **Dev-only** advisories never block CI.

## Running the audit locally

```bash
npm audit                 # full report
npm audit --omit=dev      # production-only
npm audit fix             # safe (semver-compatible) fixes
npm audit fix --force     # ! review carefully — usually downgrades
```

> **Never run `npm audit fix --force` blindly.** As of this writing, npm's
> "fix" advice for the postcss / uuid chains is to downgrade `next` from 16
> to 9 and `resend` from 6 to 6.1.3 — both would break the app immediately.
> The actual remediation is to wait for upstream packages to release a
> minor that bundles patched transitive deps.

## Currently accepted moderate-severity findings

After the most recent `npm audit fix` (Phase 7), these moderate transitive
issues remain:

### `brace-expansion < 1.1.13` via `eslint → minimatch@3.x`

- **Advisory**: GHSA-f886-m6hf-6m8v — Zero-step sequence DoS in glob expansion.
- **Why it's not patchable today**: ESLint 9.39.4 (latest) still pins
  `minimatch@3.x` for legacy compatibility. We already run a newer
  `brace-expansion@5.0.5` in every other dep tree (Sentry / typescript-eslint).
- **Why it's not exploitable here**: ESLint only parses developer-controlled
  glob patterns in `.eslintrc` / config — never user input. The CVE requires
  attacker-controlled glob input.
- **Action**: re-check on every ESLint major. Upstream issue: <https://github.com/eslint/eslint/issues/19293>.

### `postcss < 8.5.10` via `next@16.2.4`

- **Advisory**: GHSA-qx2v-qp2m-jg93 — XSS via unescaped `</style>` in
  PostCSS's stringify output.
- **Why it's not patchable today**: Next 16.2.4 bundles its own postcss
  copy. The fix lands when Next ships a patch release that bumps it; the
  alternative npm audit suggests is `next@9.3.3` (a major **downgrade**)
  which is obviously not viable.
- **Why it's not exploitable here**: PostCSS only sees CSS that we author
  in the repo. Ledra does not accept user-supplied CSS anywhere — the
  certificate templating pipeline uses react-pdf primitives, not CSS
  strings, and the marketing pages serve static Tailwind output. The
  attacker would need an injection point that doesn't exist.
- **Action**: re-check on every Next minor.

### `uuid < 14.0.0` via `resend → svix`

- **Advisory**: GHSA-w5hq-g745-h8pq — Missing buffer bounds check in
  `uuid.v3 / v5 / v6` when the optional `buf` parameter is provided.
- **Why it's not patchable today**: Resend 6.12.2 (latest) depends on
  svix 1.90, which depends on uuid 9.x. The forced fix is `resend@6.1.3`
  (a major downgrade that loses idempotency-key handling we depend on).
- **Why it's not exploitable here**: `buf` is an internal optimization
  that only fires when the caller passes one. We don't pass it. Svix
  doesn't either — it uses `uuid.v4` for webhook IDs, not v3/v5/v6.
- **Action**: monitor [resend/resend#1234](https://github.com/resend/resend-node/issues)
  for a release that bumps svix.

## When to upgrade vs. accept

- If the advisory's **CVSS score is ≥ 7.0 OR the package is in the request
  path** (auth, payment, PII): upgrade immediately, even if it means a
  major bump.
- If the advisory's **exploit precondition does not match our usage**:
  document here, mark "accepted", re-check at next quarterly review.
- If the advisory is **dev-only** (eslint, vitest, …): accept. CI can't
  reach attacker-controlled input.

## Quarterly review

Run on the first Monday of each quarter:

```bash
npm audit
npm outdated --depth=0
```

For each entry, decide: **fix now**, **wait** (upstream tracking issue),
or **risk-accept** (update this doc).
