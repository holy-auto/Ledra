# Rate-limit policy

Two layers run in series:

1. **Middleware default** (`src/proxy.ts` → `checkRateLimit(req, "middleware_default")`)
   — 300 req / 60 s per IP, applied to every `/api/*` route. Catches blanket
   bruteforce / scraping.

2. **Per-route presets** — tighter limits applied inside individual handlers
   for routes that are sensitive even within the 300/min envelope.

## Presets

Defined in `src/lib/api/rateLimit.ts`:

| Preset | Limit | Use for |
| ------ | ----- | ------- |
| `middleware_default` | 300 / 60 s | proxy.ts only |
| `general` | 60 / 60 s | normal authenticated read/list endpoints |
| `auth` | 10 / 60 s | login / OTP / Stripe / signature creation / anything that calls a paid external API or sends email |
| `webhook` | 120 / 60 s | inbound webhooks (signature-verified, but still throttled) |
| `mobile_pos` | 10 / 60 s | POS checkout (mobile + admin) |
| `mobile_terminal` | 30 / 60 s | Stripe Terminal connection-token + PaymentIntent retrieve |

## When to add a tighter preset to a route

The middleware default is enough for ordinary admin reads. Add a per-route
preset when **any** of these are true:

- Calls a billed external API (Stripe, Resend, OpenAI/Anthropic, Polygon, …).
- Sends email or SMS.
- Generates resources that cost CPU/RAM/storage (PDF, image transforms,
  ZIP exports).
- Is publicly reachable without auth (OTP, signature page, public verify).
- Mutates state that's hard to undo (subscription resume, account creation).

## Routes hardened in Phase 5

| Route | Preset | Reason |
| ----- | ------ | ------ |
| `/api/stripe/portal` POST | `auth` | Creates Stripe billing-portal session |
| `/api/stripe/checkout` POST | `auth` | Creates Stripe Checkout session |
| `/api/stripe/resume` POST | `auth` | Recreates Checkout for cancelled sub |
| `/api/stripe/connect` POST | `auth` | Creates Stripe Connect account + onboarding link |
| `/api/stripe/connect/payment-link` POST | `auth` | Creates payment Checkout (Connect) |
| `/api/agent/stripe-connect` POST | `auth` | Same, agent side |
| `/api/agent/stripe/dashboard` POST | `auth` | Mints Express Dashboard URL |
| `/api/signature/request` POST | `auth` | Generates PDF + sends email |
| `/api/admin/certificates/batch-pdf` POST | `auth` | Enqueues up to 100 PDF renders via QStash |
| `/api/admin/polygon/backfill` POST | `auth` | Spends real gas on Polygon |
| `/api/admin/pos/terminal/connection-token` POST | `mobile_terminal` | Mints Stripe Terminal token |
| `/api/admin/pos/terminal/capture` POST | `mobile_pos` | Captures Stripe Terminal payment |
| `/api/admin/shop/checkout` POST | `auth` | Creates Stripe Checkout session for shop orders |
| `/api/admin/billing-state` POST | `auth` | Retrieves Stripe Subscription on every poll |
| `/api/template-options/subscribe` POST | `auth` | Creates Stripe Customer + Checkout for option subscription |
| `/api/mobile/pos/checkout/qr-session` POST | `mobile_pos` | Creates Connect Checkout for QR pay |

## Routes intentionally left at middleware default

The remaining ~140 admin write routes (`/api/admin/agent-*`, `/api/admin/customers`,
`/api/admin/menu-items`, …) only hit our own database under tenant scope.
The middleware default's 300/min is plenty for legitimate dashboard
interactions and the cost of abuse (a few extra Postgres writes within a
tenant's own scope) is bounded by RLS + tenant scoping.

If a specific route in this group later gets a costly side effect (sending
email, calling Stripe, …) the rule above kicks in and a tighter preset
should be added at the same time.

## Logout / session-clear endpoints

`/api/portal/logout`, `/api/customer/logout`, etc are intentionally **not**
rate-limited per-route. They write at most one revocation row each call
and gracefully no-op when no cookie is present. The middleware default is
the right ceiling for these.

## Checking coverage

```bash
# count write-method routes without per-route rate limit
for f in $(find src/app/api -name "route.ts"); do
  has_write=$(grep -E "^export (async )?function (POST|PUT|PATCH|DELETE)" "$f")
  has_rl=$(grep -E "checkRateLimit|rateLimit\(" "$f")
  if [ -n "$has_write" ] && [ -z "$has_rl" ]; then
    echo "$f"
  fi
done
```

The number is expected to grow as new admin write routes land (with the
middleware default carrying them); flag any addition that matches the
"when to add a tighter preset" criteria above.
