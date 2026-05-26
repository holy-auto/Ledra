import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the passport public surface.
 *
 * Verifies the shape and auth behaviour of the routes that can be
 * reached by anonymous callers (or external API consumers) — without
 * needing a populated DB. All assertions are status-code-only so
 * they survive empty / freshly-seeded environments.
 *
 * The `PASSPORT_PUBLIC_ENABLED` gate is exercised separately by
 * src/lib/passport/__tests__/featureGate.test.ts; here we assume the
 * gate is ON in the test environment (otherwise every endpoint 404s
 * which is also a valid expected state).
 */

test.describe("Passport transfer recipient endpoints", () => {
  // A 64-hex-char string that satisfies isTransferTokenFormat but has
  // an effectively-zero chance of resolving to a real DB row.
  const FAKE_TOKEN = "0".repeat(64);

  test("GET transfer view rejects unknown token", async ({ request }) => {
    const res = await request.get(`/api/passport/transfers/${FAKE_TOKEN}`);
    expect([404, 401, 429]).toContain(res.status());
  });

  test("POST accept rejects unknown token", async ({ request }) => {
    const res = await request.post(`/api/passport/transfers/${FAKE_TOKEN}/accept`, {
      data: { to_name: "テスト" },
    });
    expect([404, 401, 429]).toContain(res.status());
  });

  test("POST reject rejects unknown token", async ({ request }) => {
    const res = await request.post(`/api/passport/transfers/${FAKE_TOKEN}/reject`);
    expect([404, 401, 429]).toContain(res.status());
  });

  test("GET transfer view rejects malformed token", async ({ request }) => {
    const res = await request.get(`/api/passport/transfers/not-a-hex-token`);
    expect([404, 401, 429]).toContain(res.status());
  });
});

test.describe("Passport admin transfer endpoints (auth required)", () => {
  test("POST initiate requires authentication", async ({ request }) => {
    const res = await request.post("/api/passport/transfers/initiate", {
      data: {
        vehicle_id: "00000000-0000-0000-0000-000000000000",
        to_owner_email: "buyer@example.com",
      },
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("POST cancel requires authentication", async ({ request }) => {
    const res = await request.post("/api/passport/transfers/cancel", {
      data: { transfer_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect([400, 401, 403]).toContain(res.status());
  });
});

test.describe("Passport v1 public API (consumer-authenticated)", () => {
  test("GET /verify requires bearer token", async ({ request }) => {
    const res = await request.get("/api/v1/passport/verify?vin=ABCDEFGH");
    expect([401, 404, 429]).toContain(res.status());
  });

  test("GET /verify rejects garbage key with 401", async ({ request }) => {
    const res = await request.get("/api/v1/passport/verify?vin=ABCDEFGH", {
      headers: { Authorization: "Bearer lpk_live_garbage_garbage_garbage" },
    });
    // 401 is the success path here; 404 happens only when the gate is off.
    expect([401, 404, 429]).toContain(res.status());
  });

  test("GET /marketplace-info requires bearer token", async ({ request }) => {
    const res = await request.get("/api/v1/passport/marketplace-info?vin=ABCDEFGH");
    expect([401, 404, 429]).toContain(res.status());
  });

  test("POST /referrals/claim requires bearer token", async ({ request }) => {
    const res = await request.post("/api/v1/passport/referrals/claim", {
      data: { lead_token: "X".repeat(40), sale_amount_jpy: 1000000 },
    });
    expect([401, 404, 429]).toContain(res.status());
  });
});

test.describe("Public passport page", () => {
  test("/v/[vin] returns 404 for an unknown VIN", async ({ request }) => {
    const res = await request.get("/v/UNKNOWNVIN0000000", { maxRedirects: 0 });
    // 404 (no row, or gate off) or 200 with notFound markup — both are
    // acceptable for a smoke test. We only care that it doesn't 500.
    expect([200, 404]).toContain(res.status());
  });
});
