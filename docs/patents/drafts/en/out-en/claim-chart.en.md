# Claim Chart (EN) — Inventions 06 / 07 / 01

> For the foreign agent / PCT. Maps each English claim to its category, dependency and the key inventive point. Companion to the EN specifications in `out-en/<inv>/` and the bilingual chart in `../claim-correspondence-chart.md`.
> Cat.: M = method, S = system, P = program. Dep.: dependency (— = independent). Final claim scope and per-jurisdiction claim formats are for the foreign agent.

## Invention 06 — Selective disclosure proof for vehicle part installation (`out-en/06/`)

| Claim | Cat. | Dep. | Gist | Key inventive point |
|---|---|---|---|---|
| 1 | M | — | claims with disclosed/non-disclosed flag → secret-nonce leaf commitments → tree root recorded on ledger → inclusion path (value only for disclosed) → server-independent verification | core selective-disclosure mechanism |
| 2 | M | 1 | coarse-grained time-of-installation claim (rounded to a period) | granularity reduction |
| 3 | M | 1,2 | nonce = keyed hash (salt; id‖type‖value); value not invertible from leaf | anti-dictionary protection of low-entropy values |
| 4 | M | 1-3 | disclosed claims and commit-only claims mixed in a single tree | mixed-taxonomy commitment tree |
| 5 | M | 1-4 | verification also requires the root to be recorded on the ledger | existence + inclusion |
| 6 | M | 1-5 | no PII / serial / price / full VIN provided to verifier | application (insurer) |
| 7 | M | 1-6 | a non-disclosed claim represents a possession-bound finalization state | link to invention 07 |
| 8 | M | 1-7 | binary hash tree; last leaf duplicated when leaf count is odd | implementation basis |
| 9 | S | — | system performing the above | — |
| 10 | P | — | program executing claims 1-8 | — |

## Invention 07 — Finalization of a part installation record (`out-en/07/`)

| Claim | Cat. | Dep. | Gist | Key inventive point |
|---|---|---|---|---|
| 1 | M | — | content hash + signature bound to phone-possession proof; transition to finalized state gated by a DB-layer constraint verifying (a) signature/hash match, (b) possession match, (c) assurance grade — with **no exception even for a privileged service account** | operator-unbypassable, possession-bound, DB-enforced finalization |
| 2 | M | 1 | achievable assurance capped when contact provenance is the record creator | anti-impersonation downgrade |
| 3 | M | 1,2 | post-finalization: only reasoned voiding; correction via new record + re-signature | complete freeze |
| 4 | M | 1-3 | serialized parts: platform-wide unique keyed-hash registry returning only collision presence; raw serial / consumer not disclosed | privacy-preserving cross-party collation |
| 5 | M | 1-4 | required grade derived from part kind / amount threshold | risk-tiered assurance |
| 6 | M | 1-5 | TSA time token + per-vehicle aggregate recorded on ledger | dual time-anchoring; link to invention 01 |
| 7 | M | 1-6 | confirmation channel: first channel preferred, fallback to second | channel resilience |
| 8 | M | 1-7 | detect & record mutual contradiction among independent records | tamper/substitution deterrence |
| 9 | S | — | system with a storage whose constraint enforces the gate | — |
| 10 | P | — | program executing claims 1-8 | — |

## Invention 01 — Integrity proof of vehicle history across businesses (`out-en/01/`)

| Claim | Cat. | Dep. | Gist | Key inventive point |
|---|---|---|---|---|
| 1 | M | — | collect per-business tx identifiers by normalized VIN → order-independent normalization (dedup + sort) → aggregate digest concatenated with VIN → record as a single transaction | order-independent digest + single-tx meta-anchor |
| 2 | M | 1 | skip second recording when digest unchanged | idempotency / cost |
| 3 | M | 1,2 | publish VIN + digest + tx set so a third party recomputes and collates | server-independent verification |
| 4 | M | 1-3 | exclude records of businesses set to opt out | opt-out |
| 5 | M | 1-4 | no PII on ledger; deletion of original renders PII unrecoverable | privacy / crypto-shredding |
| 6 | M | 1-5 | on failure, retain digest, leave tx empty, retry by periodic process | fault tolerance |
| 7 | M | 1-6 | aggregate digest computed as a hash-tree root variant | Merkle variant |
| 8 | S | — | system performing the above | — |
| 9 | P | — | program executing claims 1-7 | — |

> Note (01): independent claims are centered on the **mechanism** (cross-business aggregation / single-tx digest / third-party recomputation), not the self-disclosed broad concept. Abroad (EP/CN no grace period) file mechanism-only — see `../pct-filing-notes.en.md`.
