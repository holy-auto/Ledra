# Ledra — Generator Product Security Architecture (GPSA) Document

Template: C2PA Generator Product Security Architecture Document Template (Conformance Program v0.2).
CPL record ID: `01a06690-d01e-7608-ad8a-cd4f1a49d76e`.
Supporting documents: `Ledra-GPSA-Operational-Controls.md`, `Ledra-GPSA-TOE-Diagram.png`.

---

## 1. Generator Product Information

### 1.1 Applicant organization details

- Legal name: HOLY Inc. (株式会社HOLY)
- Address: R-Cube Aoyama 3F, 1-3-1 Kita-Aoyama, Minato-ku, Tokyo 107-0061, Japan
- Contact: info@holy-inc.jp

### 1.2 C2PA Conformance Program Version

0.2

### 1.3 C2PA Content Credentials Specification Version

2.4. Every manifest carries `claim_generator_info[].specVersion = "2.4"` and a v2 claim with a
`c2pa.actions.v2` assertion that includes `allActionsIncluded` (see the submitted samples).

### 1.4 Distinguished Name

1. **Common Name (CN)**: `Ledra`
2. **Organization (O)**: `HOLY Inc.`
3. **Organizational Unit (OU)**: (none)
4. **Country (C)**: `JP`

### 1.5 Generator Product Description

Ledra is a multi-tenant SaaS for automotive service businesses (maintenance, body repair, coating and
paint-protection-film shops). Shop staff photograph the vehicle before, during and after the work with
Ledra's Web or mobile client. The Ledra Backend processes each photo through a server-side
authenticity pipeline and attaches a signed C2PA manifest to the still image, which is then bound to the
shop's digital work certificate. The purpose is to give vehicle owners, insurers and future buyers
verifiable provenance for photographic evidence of the work performed.

### 1.6 Generator Product Target of Evaluation (GP TOE) Description

Architecture diagram: `Ledra-GPSA-TOE-Diagram.png`.

The TOE spans capture/upload, caller authentication, the authenticity pipeline, assertion generation,
claim signing and persistence of the signed asset.

| Component                                                       | Role in the TOE                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web client (Next.js, browser)                                   | Captures photos with the device camera (`<input type="file" accept="image/*" capture="environment">`) and uploads them over HTTPS. No gallery/file-picker or drag-and-drop path exists in the photo-evidence UI. |
| Mobile client (Expo / React Native)                             | Captures photos with the camera only (`pickImageFromCamera`; no library picker) and uploads them over HTTPS. Photos are not saved to the device gallery.                                                         |
| Backend (Next.js route handlers on Vercel serverless functions) | Authenticates the caller, runs the authenticity pipeline, generates assertions, signs the claim, and persists the result. All C2PA generation and signing happens here.                                          |
| Supabase (Postgres, Storage, Auth)                              | Identity provider for callers; stores the signed asset (Storage) and the manifest summary and pipeline results (Postgres).                                                                                       |
| RFC 3161 Time-Stamp Authority                                   | Returns a time-stamp token over the pre-signing SHA-256 of the asset. Stored separately from the C2PA manifest; its genTime is sealed into the `com.ledra.capture` assertion.                                    |

Authenticity pipeline, in order, for each uploaded image:

1. SHA-256 of the received bytes.
2. EXIF/GPS removal: the image is decoded and re-encoded with `sharp`, which bakes in the EXIF
   orientation and writes no EXIF, XMP or GPS metadata. If `sharp` cannot decode the input (in this
   TOE this applies to HEVC-coded HEIC), the bytes are signed as received.
3. SHA-256 of the processed bytes, RFC 3161 time-stamp request, single-use capture-nonce consumption.
4. Assertion generation:
   - `c2pa.actions.v2`: `c2pa.created` with `digitalSourceType = digitalCapture`, followed only by the
     transformations that actually took effect: `c2pa.orientation` (EXIF orientation was baked in),
     `c2pa.converted` (re-encode ran), `c2pa.edited.metadata` (source carried EXIF/GPS metadata that
     was removed; pixels are not edited). `allActionsIncluded` is `true` when the re-encode ran
     and `false` when the bytes were signed as received (in that case only `c2pa.created` is listed).
   - `com.ledra.capture`: work-certificate public ID, vehicle VIN (when recorded), the single-use capture
     nonce, and the RFC 3161 time.
5. Claim signing with the Claim Signing Credential (§2.2) and embedding of the manifest into the asset.
6. Persistence of the signed asset to Supabase Storage and of the manifest summary to Postgres.

`c2pa.created` + `digitalCapture` is asserted because the only inputs to this pipeline are the camera
capture paths described above. Limitation of the current design: the Backend verifies the file's magic
bytes and the caller's identity and capture nonce, but it does not cryptographically verify that the
pixels came from a camera sensor. On desktop browsers, which ignore the `capture` attribute, the
operating system may present a file chooser.

Integrations that are active only when their credentials are configured in the hosting environment and
that are outside the signing path (see the diagram):

- Polygon anchoring: receives only the pre-signing SHA-256.
- Hive AI-generated-image detection: receives the processed, pre-signing image.
- Pinata (IPFS): receives the signed asset after signing.

### 1.7 Implementation Class

**Backend.** Assertion generation, claim signing and custody of the signing credential are performed
entirely in the Backend hosting environment. Clients only capture and upload.

### 1.8 Target Max Assurance Level

**1**

### 1.9 Target Generator Product capabilities

1. Claim generation — still image media types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`.
2. Claim validation — none claimed in this submission. Ledra reads incoming C2PA manifests for its own
   records, but it does not embed incoming assets as ingredients, because the pre-processing originals
   carry GPS location data. The validation media types on the Intake Form are withdrawn by the cover
   email.

Samples: `a-sample.jpg`, `b-sample.png`, `c-sample.webp`, `d-sample.heic`.

---

## 2. Security Architecture Details by Objective

### 2.1 [O.1] Automated Certificate Enrollment Proof of Eligibility (§6.1)

#### 2.1.1 Assurance Level 1 & 2 Base Evidence

1. **Certificate Enrollment Process**: Ledra does not use automated certificate enrollment. The Backend
   runs a single Claim Signing Credential for the product. The certificate is issued by a CA on the C2PA
   Trust List and is provisioned manually: an administrator of HOLY Inc. places the certificate chain
   and private key into the encrypted environment variables of the production hosting environment (see
   §2.2). Triggers are initial issuance, expiry, suspected compromise and scheduled rotation.
2. **Authentication Method & API Details**: No enrollment API is used; enrollment authentication is
   performed with the issuing CA's own subscriber process. There is no automated enrollment secret in
   the TOE.
3. **Management of Authentication Secrets**: No enrollment secret is stored in the TOE. The Claim Signing
   Credential itself is protected as described in §2.2.

### 2.2 [O.2] Confidentiality of the Claim Signing Key (§6.2)

#### 2.2.1 Assurance Level 1 & 2 Base Evidence

1. **Key Generation & Storage**: ECDSA on NIST P-256 with SHA-256 (C2PA `es256`), a NIST-approved
   algorithm (FIPS 186-5). The certificate chain and PKCS#8 private key are stored as the environment
   variables `C2PA_SIGNER_CERT` and `C2PA_SIGNER_KEY` of the Vercel production environment. Vercel
   encrypts environment variables at rest. The key is read only by the signer module
   (`src/lib/anchoring/providers/c2paSigner.ts`) and is never written to disk, logs, the database or
   API responses.
2. **Access Controls & Encryption**: Only members of the HOLY Inc. Vercel team with project-administrator
   permission can read or change production environment variables. At runtime the key exists only in
   the memory of the Backend function process that performs signing.
3. **Ephemeral Plaintext Key Handling**: The signer module constructs a `LocalSigner` from the key on the
   first signing request in a function instance and caches it in module scope; the plaintext key
   therefore stays in that process's memory until the instance is recycled by the platform. It is not
   serialised or exported. Key handling inside `LocalSigner` is performed by non-GP code
   (`@contentauth/c2pa-node`, native `c2pa-rs`). That dependency is monitored by Dependabot and by the CI
   `npm audit` gate, and upgraded under the remediation policy in §2.3 (details:
   `Ledra-GPSA-Operational-Controls.md` §1–§2).
4. **Key Rotation Process**: A new certificate and key are obtained from the issuing CA and replace the
   two environment variables, and a redeploy activates them (new function instances read the new values
   on first signing). The previous certificate is revoked through the CA when compromise is suspected.
   Triggers are certificate expiry, suspected compromise and scheduled rotation. Procedure:
   `Ledra-GPSA-Operational-Controls.md` §4.
5. **Subsystem Mutual Authentication & Role Validation (Backend class)**: Every upload request is
   authenticated before any processing or signing:
   - Web: Supabase Auth session → `withCaller` / `resolveCallerWithRole` (tenant membership) with the
     `certificates:edit` permission and rate limiting.
   - Mobile: Supabase access token → `resolveMobileCaller` + `requireMinRole(caller, "staff")`.
     Requests that fail authentication or role checks are rejected before the pipeline runs. In addition,
     each capture session carries a server-issued, single-use capture nonce bound to the work certificate;
     the Backend consumes it under a row lock and records the result. An upload without a valid nonce is
     still accepted, but is recorded with a lower authenticity grade and no nonce is sealed into
     `com.ledra.capture`. The TOE
     contains device-attestation code (App Attest / Play Integrity); it is disabled in this configuration
     (`DEVICE_ATTESTATION_ENABLED` unset) and is not claimed as a control in this submission.

### 2.3 [O.3] Protection of the Claim Generator (§6.3)

#### 2.3.1 Assurance Level 1 & 2 Base Evidence

1. **SCA / SBOM Scanning Tools**:
   - **Dependabot** (`.github/dependabot.yml`): weekly scans of the npm dependency graph, including
     `@contentauth/c2pa-node`, against GitHub Advisory Database data, which incorporates NVD CVEs; raises
     alerts and upgrade pull requests.
   - **CI `npm audit`** (`.github/workflows/ci.yml`): `npm audit --audit-level=high --omit=dev` runs on
     every push and pull request to `main` and `staging` and fails the build when a HIGH or CRITICAL
     advisory affects a production dependency.
   - **CodeQL** (`.github/workflows/codeql.yml`): `security-extended` static analysis on pushes and pull
     requests to `main` and weekly.
2. **90-Day Remediation Policy**: CRITICAL and HIGH (CVSS v3+) vulnerabilities in the Claim Generator are
   remediated or mitigated within 90 days of detection. The CI `npm audit` gate is stricter than this in
   practice: a build that contains a known HIGH/CRITICAL advisory in a production dependency fails on the
   day the advisory is published, so it cannot be merged or deployed while the vulnerability remains.
   Policy: `Ledra-GPSA-Operational-Controls.md` §2.

### 2.4 [O.4] Protection of Assets & Assertions at Generation (§6.4)

#### 2.4.1 Assurance Level 1 & 2 Base Evidence

Software in the TOE that processes content or assertions: `sharp` (decode, orientation, re-encode,
metadata removal), `exifr` (metadata read), `@contentauth/c2pa-node` (manifest construction and
signing), and Ledra's own pipeline code (`src/lib/certificateImages/*`, `src/lib/anchoring/*`).

1. **SCA / SBOM Scanning Tools**: the same Dependabot, CI `npm audit` and CodeQL controls as §2.3 cover
   all of these packages.
2. **90-Day Remediation Policy**: the same policy and CI gate as §2.3 apply.

### 2.5 [O.5] Protection of Traffic Between Subsystems (§6.5)

#### 2.5.1 Assurance Level 1 & 2 Base Evidence (Backend class)

1. **TLS & Cryptographic Protocols**:
   - Web and mobile clients → Backend: HTTPS only, terminated by the Vercel edge network, which
     negotiates TLS 1.3 with current clients. Plain HTTP is redirected to HTTPS.
   - Backend → Supabase (Auth, Postgres via the REST/PostgREST API, Storage): HTTPS to the Supabase
     project endpoint.
   - Backend → RFC 3161 TSA and the integrations in §1.6: HTTPS.
     Cipher suites are those of the managed TLS configurations of Vercel and Supabase.

### 2.6 [O.6] Protection of the Hosting Environment (§6.6)

#### 2.6.1 Assurance Level 1 & 2 Base Evidence (Backend class)

1. **IAM & RBAC**: Human access to the hosting environment is governed by Vercel team roles and Supabase
   organization roles. Application access is governed by Supabase Auth plus Ledra's role checks
   (`resolveCallerWithRole`, `requireMinRole`). The upload/persistence path uses a server-only
   service-role client scoped to the caller's tenant (`createTenantScopedAdmin(tenantId)`); on that path
   tenant isolation is enforced by the application, which filters every query and storage path by the
   authenticated caller's `tenant_id`. Postgres Row Level Security protects the paths that use
   tenant-authenticated clients.
2. **Principal Access Policies**: Human principals are the HOLY Inc. administrators who are members of
   the Vercel team and Supabase organization. Non-human principals are the Supabase service-role key and
   the integration API keys, stored only as encrypted Vercel environment variables and used only
   server-side.
3. **Cloud Resource IAM Policies**: Signed assets are stored in the Supabase Storage bucket `assets`
   under `<tenant_id>/<certificate_id>/`. The bucket is public-read by object URL, by design: signed
   photos are displayed on each work certificate's public verification page. Anonymous listing of the
   bucket is disabled (no bucket-wide SELECT policy), and authenticated users can reach only their own
   tenant's folder through the Storage API (tenant-scoped policy). Signed assets and their database
   records are written by the Backend. Supabase Postgres, Storage and Vercel functions are administered
   only through the respective platform consoles by the principals above.
4. **Vulnerability Scanning & OWASP Top 10 Coverage**: Dependencies and API surfaces are covered by
   Dependabot, the CI `npm audit` gate and CodeQL `security-extended`. The mapping of controls to each
   OWASP Top 10 (2021) category is in `Ledra-GPSA-Operational-Controls.md` §3.
5. **Timely Remediation Policy**: High within 30 days, Moderate within 90 days, Low within 180 days of
   detection (`Ledra-GPSA-Operational-Controls.md` §2).

---

## 3. Assurance Level

Ledra asserts conformance to **Assurance Level 1** under the controls described in §2.
