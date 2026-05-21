/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { GET, POST } from "@/app/api/signature/review/[token]/route";

const TOKEN = "tok-1234567890";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-42d2-a222-222222222222";
const CERT_ID = "33333333-3333-43d3-a333-333333333333";

beforeEach(() => {
  mocks.createServiceRoleAdmin.mockReset();
});

function makeReq(body?: unknown) {
  return new Request(`http://localhost/api/signature/review/${TOKEN}`, {
    method: body == null ? "GET" : "POST",
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  }) as any;
}
function makeCtx() {
  return { params: Promise.resolve({ token: TOKEN }) };
}

function buildAdmin(opts: {
  session?: { data: unknown; error: unknown };
  tenant?: { data: unknown; error: unknown };
  existingReview?: { data: unknown; error: unknown };
  certificate?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
  inserted?: unknown[];
}) {
  const inserted = opts.inserted ?? [];
  return {
    from(table: string) {
      const b: any = {
        select() {
          return b;
        },
        eq() {
          return b;
        },
        async maybeSingle() {
          if (table === "signature_sessions") return opts.session ?? { data: null, error: null };
          if (table === "tenants") return opts.tenant ?? { data: null, error: null };
          if (table === "signature_reviews") return opts.existingReview ?? { data: null, error: null };
          if (table === "certificates") return opts.certificate ?? { data: null, error: null };
          return { data: null, error: null };
        },
        async single() {
          return opts.insertResult ?? { data: { id: "new-review" }, error: null };
        },
        insert(row: unknown) {
          if (table === "signature_reviews") inserted.push(row);
          return {
            select: () => ({
              single: async () => opts.insertResult ?? { data: { id: "new-review" }, error: null },
            }),
          };
        },
      };
      return b;
    },
  };
}

describe("GET /api/signature/review/[token]", () => {
  it("returns 404 when no session matches the token", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(buildAdmin({ session: { data: null, error: null } }));
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns can_review=false when status is not 'signed'", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "pending", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        tenant: { data: { name: "shop", google_review_url: null }, error: null },
      }),
    );
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { can_review: boolean };
    expect(body.can_review).toBe(false);
  });

  it("returns tenant info + can_review=true for a signed session", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        tenant: {
          data: { name: "山田自動車", google_review_url: "https://g.co/r/123" },
          error: null,
        },
      }),
    );
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenant_name: string;
      google_review_url: string;
      can_review: boolean;
      already_reviewed: boolean;
    };
    expect(body.tenant_name).toBe("山田自動車");
    expect(body.google_review_url).toBe("https://g.co/r/123");
    expect(body.can_review).toBe(true);
    expect(body.already_reviewed).toBe(false);
  });

  it("returns already_reviewed=true with prior review payload", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        tenant: { data: { name: "shop", google_review_url: null }, error: null },
        existingReview: {
          data: { id: "rev-1", rating: 5, comment: "最高", google_redirected_at: null },
          error: null,
        },
      }),
    );
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already_reviewed: boolean; review: { rating: number; comment: string } };
    expect(body.already_reviewed).toBe(true);
    expect(body.review.rating).toBe(5);
    expect(body.review.comment).toBe("最高");
  });
});

describe("POST /api/signature/review/[token]", () => {
  it("rejects invalid rating", async () => {
    const res = await POST(makeReq({ rating: 0 }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(buildAdmin({ session: { data: null, error: null } }));
    const res = await POST(makeReq({ rating: 5 }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("rejects when session is not signed", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "pending", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
      }),
    );
    const res = await POST(makeReq({ rating: 5 }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("inserts review and returns google_review_url for 5 stars when configured", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        certificate: { data: { customer_id: "cust-1" }, error: null },
        tenant: { data: { google_review_url: "https://g.co/r/456" }, error: null },
        inserted,
      }),
    );
    const res = await POST(makeReq({ rating: 5, comment: "とても満足" }), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { google_review_url: string | null };
    expect(body.google_review_url).toBe("https://g.co/r/456");
    expect(inserted).toHaveLength(1);
    const row = inserted[0] as any;
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.signature_session_id).toBe(SESSION_ID);
    expect(row.certificate_id).toBe(CERT_ID);
    expect(row.customer_id).toBe("cust-1");
    expect(row.rating).toBe(5);
    expect(row.comment).toBe("とても満足");
    expect(row.google_redirected_at).toBeNull();
  });

  it("omits google_review_url for low ratings", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        certificate: { data: { customer_id: null }, error: null },
        tenant: { data: { google_review_url: "https://g.co/r/456" }, error: null },
        inserted,
      }),
    );
    const res = await POST(makeReq({ rating: 2 }), makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { google_review_url: string | null };
    expect(body.google_review_url).toBeNull();
  });

  it("returns 409 on duplicate (UNIQUE constraint)", async () => {
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        certificate: { data: { customer_id: "cust-1" }, error: null },
        insertResult: { data: null, error: { code: "23505", message: "duplicate" } },
      }),
    );
    const res = await POST(makeReq({ rating: 4 }), makeCtx());
    expect(res.status).toBe(409);
  });

  it("records google_redirected_at when google_redirected=true", async () => {
    const inserted: unknown[] = [];
    mocks.createServiceRoleAdmin.mockReturnValueOnce(
      buildAdmin({
        session: {
          data: { id: SESSION_ID, status: "signed", tenant_id: TENANT_A, certificate_id: CERT_ID },
          error: null,
        },
        certificate: { data: { customer_id: null }, error: null },
        tenant: { data: { google_review_url: "https://g.co/r/789" }, error: null },
        inserted,
      }),
    );
    const res = await POST(makeReq({ rating: 5, google_redirected: true }), makeCtx());
    expect(res.status).toBe(200);
    const row = inserted[0] as any;
    expect(row.google_redirected_at).not.toBeNull();
  });
});
