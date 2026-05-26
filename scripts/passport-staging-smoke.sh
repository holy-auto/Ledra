#!/usr/bin/env bash
# passport-staging-smoke.sh
#
# Runs curl-based smoke checks against a deployed Ledra environment to
# verify the public passport surface (`/v/[vin]`, `/api/v1/passport/*`,
# transfer recipient routes, cron endpoints).
#
# Usage:
#   BASE=https://staging.example.com \
#   KEY=lpk_live_xxxxxxxx \
#   VIN=JH4DC53001S000001 \
#   CRON_SECRET=secret_xxxx \
#     bash scripts/passport-staging-smoke.sh
#
# Optional:
#   KEY_LOW_QUOTA=lpk_live_yyy   - if set, runs the monthly-quota 429 check
#
# Exits non-zero on first FAIL. Designed to be wired into deploy gating.

set -uo pipefail

: "${BASE:?BASE (e.g. https://staging.example.com) is required}"
: "${KEY:?KEY (lpk_live_...) is required}"
: "${VIN:?VIN (existing anchored VIN) is required}"

FAILED=0
TOTAL=0

# ─── helpers ────────────────────────────────────────────────
log() { printf "%s\n" "$*"; }

assert_status() {
  local label="$1" url="$2" expected="$3" method="${4:-GET}" body="${5:-}" auth="${6:-}"
  TOTAL=$((TOTAL + 1))

  local args=(-s -o /dev/null -w "%{http_code}")
  [[ "$method" == "POST" ]] && args+=(-X POST -H "Content-Type: application/json" -d "$body")
  [[ -n "$auth" ]] && args+=(-H "Authorization: Bearer $auth")

  local code
  code="$(curl "${args[@]}" "$url")"

  if [[ ",${expected}," == *",${code},"* ]]; then
    printf "  OK   [%s] %s -> %s\n" "$method" "$label" "$code"
  else
    printf "  FAIL [%s] %s -> %s (expected: %s)\n" "$method" "$label" "$code" "$expected"
    FAILED=$((FAILED + 1))
  fi
}

assert_meta_anchor_self_consistent() {
  TOTAL=$((TOTAL + 1))
  local body
  body="$(curl -fsS -H "Authorization: Bearer $KEY" "$BASE/api/v1/passport/verify?vin=$VIN" 2>/dev/null || true)"
  if [[ -z "$body" ]]; then
    printf "  FAIL meta_anchor self-consistency: /verify returned empty\n"
    FAILED=$((FAILED + 1))
    return
  fi

  local stored
  stored="$(printf '%s' "$body" | jq -r '.meta_anchor.hash // empty')"
  if [[ -z "$stored" ]]; then
    printf "  SKIP meta_anchor not yet anchored for VIN (no certs?), skipping self-check\n"
    return
  fi

  local recomputed
  recomputed="$(
    printf '%s' "$body" \
    | jq -r '([.vin_normalized] + ([.certificates[].polygon_tx_hash] | sort | unique | map(ascii_downcase))) | join("\n")' \
    | sha256sum | awk '{print $1}'
  )"

  if [[ "$stored" == "$recomputed" ]]; then
    printf "  OK   meta_anchor.hash matches client-side recomputation (%s…)\n" "${stored:0:12}"
  else
    printf "  FAIL meta_anchor self-consistency: stored=%s, recomputed=%s\n" "$stored" "$recomputed"
    FAILED=$((FAILED + 1))
  fi
}

# ─── public page ────────────────────────────────────────────
log "[1/4] /v/[vin] public page"
assert_status "/v/<existing VIN>"    "$BASE/v/$VIN"                  "200"     GET
assert_status "/v/<unknown VIN>"     "$BASE/v/UNKNOWNVIN0000000"     "404"     GET

# ─── v1 verify API ──────────────────────────────────────────
log "[2/4] /api/v1/passport/* consumer-authenticated"
assert_status "/verify no auth"      "$BASE/api/v1/passport/verify?vin=$VIN"      "401"     GET
assert_status "/verify bad key"      "$BASE/api/v1/passport/verify?vin=$VIN"      "401"     GET "" "lpk_live_garbage_garbage_garbage"
assert_status "/verify happy path"   "$BASE/api/v1/passport/verify?vin=$VIN"      "200"     GET "" "$KEY"
assert_status "/marketplace no auth" "$BASE/api/v1/passport/marketplace-info?vin=$VIN" "401" GET
assert_meta_anchor_self_consistent

if [[ -n "${KEY_LOW_QUOTA:-}" ]]; then
  log "  Monthly-quota 429 check (KEY_LOW_QUOTA set)"
  # Fire 1 more than the quota; the last should 429. We don't know the
  # exact quota so we sample 5 times and expect at least one 429.
  saw_429=0
  for i in 1 2 3 4 5; do
    code="$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $KEY_LOW_QUOTA" \
      "$BASE/api/v1/passport/verify?vin=$VIN")"
    [[ "$code" == "429" ]] && saw_429=1
  done
  TOTAL=$((TOTAL + 1))
  if [[ "$saw_429" -eq 1 ]]; then
    printf "  OK   /verify eventually returns 429 with low-quota key\n"
  else
    printf "  FAIL low-quota key never returned 429 over 5 calls\n"
    FAILED=$((FAILED + 1))
  fi
fi

# ─── transfer recipient endpoints ───────────────────────────
log "[3/4] /api/passport/transfers/[token]"
FAKE_TOKEN="$(printf '0%.0s' {1..64})"
assert_status "GET token"     "$BASE/api/passport/transfers/$FAKE_TOKEN"           "404"     GET
assert_status "POST accept"   "$BASE/api/passport/transfers/$FAKE_TOKEN/accept"    "404"     POST "{}"
assert_status "POST reject"   "$BASE/api/passport/transfers/$FAKE_TOKEN/reject"    "404"     POST "{}"
# admin-only endpoints — should require auth
assert_status "POST initiate (no auth)" "$BASE/api/passport/transfers/initiate" \
  "400,401,403" POST '{"vehicle_id":"00000000-0000-0000-0000-000000000000","to_owner_email":"x@example.com"}'
assert_status "POST cancel (no auth)"   "$BASE/api/passport/transfers/cancel" \
  "400,401,403" POST '{"transfer_id":"00000000-0000-0000-0000-000000000000"}'

# ─── cron smoke ─────────────────────────────────────────────
if [[ -n "${CRON_SECRET:-}" ]]; then
  log "[4/4] cron endpoints (CRON_SECRET set)"
  assert_status "billing cron (current month replay)" \
    "$BASE/api/cron/passport-billing?period=$(date -u +%Y-%m)" "200" GET "" "$CRON_SECRET"
  assert_status "meta-anchor retry cron" \
    "$BASE/api/cron/passport-meta-anchor-retry" "200" GET "" "$CRON_SECRET"
else
  log "[4/4] cron smoke skipped (set CRON_SECRET to enable)"
fi

# ─── summary ────────────────────────────────────────────────
log ""
log "─── Smoke Summary ───────────────────────────────────────"
log "Total:  $TOTAL"
log "Failed: $FAILED"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
