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
echo "vendor/c2pa ready"
