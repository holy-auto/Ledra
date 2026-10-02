#!/bin/sh
# Fetch c2pa-rs 0.90.22 from crates.io, verify its published checksum, and apply the harness patch.
set -eu
cd "$(dirname "$0")"
V=0.90.22
SHA256=20fb4160e041eef6dcf2fa3b92db50b8f28d4cf4415dff44bf727cb28c3a58cb
rm -rf vendor && mkdir vendor
curl -sSfL -A ledra-c2pa-crjson-harness -o vendor/c2pa.crate "https://crates.io/api/v1/crates/c2pa/$V/download"
echo "$SHA256  vendor/c2pa.crate" | sha256sum -c -
tar xzf vendor/c2pa.crate -C vendor && mv "vendor/c2pa-$V" vendor/c2pa && rm vendor/c2pa.crate
patch -s -d vendor/c2pa -p1 < c2pa-0.90.22-harness.patch
# Validation must read the clock only through crypto::internal::time::utc_now (VALIDATION_TIME).
# The two other wall-clock reads are on the signing side. Any change to this list fails setup.
rc=0
clock=$(grep -rlE '(Utc|Local)::now *\(\)|SystemTime::now *\(\)' vendor/c2pa/src | sort) || rc=$?
expected="vendor/c2pa/src/assertions/assertion_metadata.rs
vendor/c2pa/src/crypto/internal/time.rs
vendor/c2pa/src/utils/ephemeral_cert.rs"
if [ "$rc" -gt 1 ] || [ "$clock" != "$expected" ]; then
  printf 'unexpected wall-clock reads in c2pa:\n%s\n' "$clock" >&2
  exit 1
fi
echo "vendor/c2pa ready"
