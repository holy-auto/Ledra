# Ledra GPSA — Operational Security Controls (Supporting Document)

Supporting document to `Ledra-GPSA.md`. It describes the controls referenced from objectives O.2–O.6.
Configuration files named here are in the Ledra source repository.

## 1. Dependency and vulnerability scanning (O.3 / O.4 / O.6)

| Control             | Configuration                  | Scope and trigger                                                            | Effect                                                                                                                               |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Dependabot          | `.github/dependabot.yml`       | npm (repository root and `/apps/mobile`) and GitHub Actions; weekly (Monday) | Alerts and upgrade pull requests for dependencies with known vulnerabilities (GitHub Advisory Database, which incorporates NVD CVEs) |
| CI `npm audit` gate | `.github/workflows/ci.yml`     | Every push and pull request to `main` and `staging`                          | `npm audit --audit-level=high --omit=dev` fails the build when a HIGH or CRITICAL advisory affects a production dependency           |
| CodeQL              | `.github/workflows/codeql.yml` | Push and pull request to `main`, and weekly (Monday 03:00 UTC)               | `security-extended` static analysis of the application code                                                                          |
| CI quality gates    | `.github/workflows/ci.yml`     | Every push and pull request to `main` and `staging`                          | Lint, TypeScript type check, unit tests with coverage (including a C2PA sign-and-validate conformance test)                          |

These cover the Claim Generator (`@contentauth/c2pa-node`) and all content-processing software in the
TOE (`sharp`, `exifr`, and Ledra's pipeline code).

## 2. Vulnerability remediation policy (O.3 / O.4 / O.6)

Detected vulnerabilities are triaged from Dependabot and CodeQL alerts and fixed through pull requests.

| Severity (CVSS v3+) | Claim Generator and content-processing software (O.3 / O.4) | Hosting environment (O.6) |
| ------------------- | ----------------------------------------------------------- | ------------------------- |
| CRITICAL            | Remediated or mitigated within 90 days of detection         | Within 30 days            |
| HIGH                | Remediated or mitigated within 90 days of detection         | Within 30 days            |
| MODERATE            | —                                                           | Within 90 days            |
| LOW                 | —                                                           | Within 180 days           |

Release control: a build is deployed to production only from the `main` branch. The CI `npm audit` gate
fails any build that contains a known HIGH or CRITICAL advisory in a production dependency, so such a
build is not released; in practice this is stricter than the 90-day ceiling.

## 3. OWASP Top 10 (2021) coverage (O.6)

| Category                                       | Controls                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 Broken Access Control                      | Every API route authenticates the caller and checks tenant membership and role/permission (`withCaller`, `resolveCallerWithRole`, `requireMinRole`). Service-role access is server-only and scoped to the caller's tenant (`createTenantScopedAdmin`); tenant-authenticated clients are additionally constrained by Postgres Row Level Security. |
| A02 Cryptographic Failures                     | HTTPS only (TLS 1.3 with current clients); secrets and the signing key stored as encrypted environment variables; ES256 claim signatures.                                                                                                                                                                                                        |
| A03 Injection                                  | Database access through the Supabase client (parameterised PostgREST queries); CodeQL `security-extended` queries for injection and XSS; request validation with Zod schemas.                                                                                                                                                                    |
| A04 Insecure Design                            | Authentication, tenant isolation, single-use capture nonces and a manifest action ledger that lists only transformations actually applied are part of the pipeline design.                                                                                                                                                                       |
| A05 Security Misconfiguration                  | Managed platform configuration (Vercel, Supabase); Supabase security advisor findings are remediated by migrations; CodeQL.                                                                                                                                                                                                                      |
| A06 Vulnerable and Outdated Components         | Dependabot, CI `npm audit` gate.                                                                                                                                                                                                                                                                                                                 |
| A07 Identification and Authentication Failures | Supabase Auth; role/permission checks on every route; rate limiting on the upload routes.                                                                                                                                                                                                                                                        |
| A08 Software and Data Integrity Failures       | Lockfile-pinned dependencies (`npm ci`); CI type check and tests; C2PA signatures on the produced assets.                                                                                                                                                                                                                                        |
| A09 Security Logging and Monitoring Failures   | Sentry error and exception monitoring for the Backend; Vercel function logs; Supabase logs.                                                                                                                                                                                                                                                      |
| A10 Server-Side Request Forgery                | Outbound requests from the pipeline go only to fixed, configured endpoints (Supabase and the integrations); no user-supplied URL is fetched by the pipeline.                                                                                                                                                                                     |

## 4. Claim signing key rotation procedure (O.2)

1. Obtain a new Claim Signing Certificate and private key from the issuing CA on the C2PA Trust List.
2. Verify the candidate credential with `scripts/verify-c2pa-cert.mjs`, which signs a test asset with it
   and requires the result to validate as Trusted against the C2PA Trust List.
3. Replace the Vercel production environment variables `C2PA_SIGNER_CERT` and `C2PA_SIGNER_KEY`
   (project administrators only; values are encrypted at rest).
4. Redeploy. New function instances load the new credential on their first signing request.
5. If compromise is suspected, request revocation of the previous certificate from the issuing CA.

Triggers: certificate expiry, suspected key compromise, and scheduled rotation.
