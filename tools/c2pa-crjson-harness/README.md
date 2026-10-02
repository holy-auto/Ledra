# Ledra crJSON test harness

Test harness for Ledra's C2PA claim validation, as required by the C2PA Conformance Program
_Additional Conformance Requirements v0.2, §2.3_.

```
c2pa-crjson-harness <asset> <c2pa-trust-list.pem> <tsa-trust-list.pem> <validation-time>
```

| Input             | Meaning                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `asset`           | File to validate (format detected from its extension and contents).                                      |
| `c2pa-trust-list` | PEM bundle of trust anchors for claim signers. An empty file means no anchors.                           |
| `tsa-trust-list`  | PEM bundle of trust anchors for time-stamp authorities. Used only for time-stamp tokens.                 |
| `validation-time` | RFC 3339 time. Certificate validity without a time-stamp, OCSP and the reported `validationTime` use it. |

The validation results are printed to stdout in crJSON. Errors go to stderr with a non-zero exit code.

## Engine

The harness runs the validation engine Ledra's product uses: c2pa-rs **0.90.22**, the version inside
`@contentauth/c2pa-node` 0.9.7. The crJSON is produced by c2pa-rs's own `Reader::crjson_checked`.

c2pa-rs 0.90.22 has one trust store for claim signers and time-stamp authorities, and it validates
at the system clock. `c2pa-0.90.22-harness.patch` adds the two inputs it lacks. Its other changes route existing clock reads and trust checks through them:

- `harness_overrides::VALIDATION_TIME` replaces the system clock, including the `validationTime` reported for ingredient manifests.
- `harness_overrides::TSA_TRUST_POLICY` replaces the claim-signer trust list when checking time-stamp certificates.

CAWG identity assertions are checked at the same validation time: the patch routes the identity-assertion
credential date checks (`validFrom` / `validUntil`) through `VALIDATION_TIME` too. `setup.sh` fails unless the
only wall-clock reads left in the patched crate are the clock helper itself and two signing-side ones.
The self-test has no CAWG identity assertion, so this path is checked by that scan, not at run time.

## Build and self-test

Requires a Rust toolchain, `curl`, `patch`, `sha256sum`, and for the self-test `openssl` and the repo's `node_modules`.

```sh
tools/c2pa-crjson-harness/setup.sh          # crates.io c2pa 0.90.22 (checksum-verified) + patch -> vendor/c2pa
cargo build --release --manifest-path tools/c2pa-crjson-harness/Cargo.toml
node tools/c2pa-crjson-harness/selftest.mjs # 6 cases: trusted, untrusted, expired, TSA trusted, TSA list separation, ingredient validationTime
```
