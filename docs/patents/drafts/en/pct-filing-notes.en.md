# PCT / Foreign Filing Notes (EN)

> Companion to JP-domestic guides `09-filing-guide.md` and `10-art30-novelty-exception.md`. **For information only — engage a qualified patent attorney/foreign agent. Official fees, periods and rules must be verified with WIPO/each office.**

## 1. Route & timeline
- **File a Japanese (priority) application first.** Within **12 months** (Paris Convention priority), file a **PCT** application (or direct national applications) claiming priority.
- PCT national/regional phase entry is typically by **30/31 months** from the priority date (varies by office).
- One JP filing → PCT preserves the priority date while deferring the cost of multi-country entry.

## 2. Grace period differs by country — critical for invention 01
- **Japan (Art.30):** ~1-year grace for the applicant's own disclosure, with formal requirements (claim at filing + proof within the prescribed period). See `10-art30-novelty-exception.md`.
- **United States (35 U.S.C. §102(b)(1)):** 1-year grace for inventor-origin disclosures.
- **EPO / China and many others:** **No general grace period.** A pre-filing disclosure (even the applicant's own) generally destroys novelty.
- **Consequence:**
  - **01 (meta-anchor):** the broad concept (cross-business aggregation keyed by VIN) was **self-disclosed**, so the broad concept is likely **unrecoverable in EP/CN**. Abroad, claim **only the undisclosed mechanism** (order-independent digest → single transaction → server-independent recomputation). Do not rely on a grace period abroad.
  - **06 (ZKP) and 07 (gate):** core mechanisms are **undisclosed**. They remain clean for foreign filing **provided no disclosure occurs before the priority filing.** Keep the publication freeze until filed.

## 3. Unity of invention (PCT Rule 13)
- A PCT application must relate to one invention or a group linked by a **single general inventive concept (special technical feature)**.
- Bundling 01 + 06 + 07 risks a **lack-of-unity** finding → additional search/examination fees and effective splitting.
- **Recommendation: separate applications** (priority order 06 → 07 → 01). A "pipeline" framing (content hash flowing through possession-bound finalization → server-independent aggregation → selective disclosure) is documented in `../統合出願-単一性と統合請求項案.md` if a combined filing is nonetheless desired.

## 4. Drafting cautions for foreign prosecution
- **No new matter:** everything must be supported by the specification as filed (EPO added-matter practice is strict). The detailed descriptions and worked examples in the EN specs are written to provide that support.
- **Patent-eligibility (software/crypto):** describe **hardware cooperation** (processor, memory, communication circuit, storage, ledger node) and the concrete technical effect — done in the EN specs. US §101 / EPO "technical character" both benefit from the cryptographic and database-enforcement mechanisms (not mere business logic).
- **Claim categories:** method, system and (computer-readable medium / program) claims are provided. For the US, prefer a "non-transitory computer-readable medium" formulation over a bare "program" if needed (adapt at national phase).

## 5. Prior-art clearance (foreign)
- 01: the WO2018014123A1 family ("distributed ledger platform for vehicle records"), plus US VIN-ledger filings.
- 06: W3C Verifiable Credentials / SD-JWT / BBS+ / Merkle selective disclosure; SSI patents (e.g. US 2022/0272085 A1).
- 07: parts provenance/anti-counterfeit (US 2021/0119771 A1); e-signature / GS1 serialization.
- These were the closest references in the preliminary search (`../../08-prior-art-search.md`); a professional clearance is still required.

## 6. Recommended sequence
1. Keep the publication freeze (`PASSPORT_PATENT_HOLD=1`).
2. File JP priority applications: **06 → 07** (clean), then **01** (mechanism-only; handle Art.30 domestically).
3. Within 12 months, decide PCT/foreign entry per commercial footprint (insurers/OEMs abroad).
4. For 01 abroad, file mechanism-only claims; do not depend on any grace period.
