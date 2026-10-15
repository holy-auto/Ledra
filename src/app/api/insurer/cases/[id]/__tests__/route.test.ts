/**
 * PATCH /api/insurer/cases/[id] compare-and-swap test.
 *
 * The single-case PATCH mirrors the bulk route's status compare-and-swap so
 * that concurrent requests can't both "win" the same transition and
 * double-emit the insurer_case.status_changed webhook. The contract tested:
 *
 *   - status change: the UPDATE is scoped by the previously-read status (CAS),
 *     and the updated row is returned.
 *   - status change that lost the race (UPDATE matches 0 rows): the route
 *     re-reads and returns the current row with 200 instead of erroring.
 *   - non-status update: no status CAS filter is applied, so a concurrent
 *     status change elsewhere can't spuriously fail an unrelated field edit.
 *
 * after() is stubbed to a no-op here; this test targets the synchronous CAS
 * decision, not the deferred notification/webhook fan-out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCallerMock, rateLimitMock, fromMock, emitWebhookMock, notifyMock, storageFromMock } = vi.hoisted(() => ({
  storageFromMock: vi.fn(),
  resolveCallerMock: vi.fn(),
  rateLimitMock: vi.fn(),
  fromMock: vi.fn(),
  emitWebhookMock: vi.fn().mockResolvedValue(undefined),
  notifyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/server", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, after: () => undefined };
});

vi.mock("@/lib/api/insurerAuth", () => ({
  resolveInsurerCaller: (...a: unknown[]) => resolveCallerMock(...a),
}));

vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimitMock(...a),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createInsurerScopedAdmin: () => ({ admin: { from: fromMock, storage: { from: storageFromMock } } }),
}));

vi.mock("@/lib/outbound-webhooks", () => ({
  emitEntityWebhook: (...a: unknown[]) => emitWebhookMock(...a),
}));

vi.mock("@/lib/insurer/notifications", () => ({
  sendCaseStatusNotification: (...a: unknown[]) => notifyMock(...a),
}));

import { GET, PATCH } from "@/app/api/insurer/cases/[id]/route";
import type { NextRequest } from "next/server";

const INSURER_ID = "11111111-1111-1111-1111-111111111111";

function patchReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/insurer/cases/case-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: "case-1" }) };

/** Chainable supabase-from() stub. Terminal maybeSingle/single resolve `result`. */
function chain(result: { data: unknown; error?: unknown }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const k of ["select", "eq", "in", "update", "insert", "order"]) c[k] = vi.fn(() => c);
  c.maybeSingle = vi.fn(() => Promise.resolve({ error: null, ...result }));
  c.single = vi.fn(() => Promise.resolve({ error: null, ...result }));
  return c;
}

const baseCase = {
  id: "case-1",
  insurer_id: INSURER_ID,
  status: "in_progress",
  tenant_id: null,
  case_number: "C-1",
  title: "old",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("PATCH /api/insurer/cases/[id] compare-and-swap", () => {
  beforeEach(() => {
    resolveCallerMock.mockReset();
    rateLimitMock.mockReset().mockResolvedValue(null);
    fromMock.mockReset();
    emitWebhookMock.mockClear();
    notifyMock.mockClear();
    resolveCallerMock.mockResolvedValue({ insurerId: INSURER_ID, insurerUserId: "iu-1", userId: "u-1" });
  });

  it("status change: scopes the UPDATE by the read status (CAS) and returns the updated row", async () => {
    const existing = chain({ data: { id: "case-1", insurer_id: INSURER_ID, status: "in_progress" } });
    const update = chain({ data: { ...baseCase, status: "resolved" } });
    const logInsert = chain({ data: null });
    fromMock.mockReturnValueOnce(existing).mockReturnValueOnce(update).mockReturnValueOnce(logInsert);

    const res = await PATCH(patchReq({ status: "resolved" }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { case: { status: string } };
    expect(body.case.status).toBe("resolved");
    // CAS filter applied with the status we read (in_progress).
    expect(update.eq.mock.calls).toContainEqual(["status", "in_progress"]);
  });

  it("status change that lost the race (0 rows): re-reads and returns 200 without erroring", async () => {
    const existing = chain({ data: { id: "case-1", insurer_id: INSURER_ID, status: "in_progress" } });
    const update = chain({ data: null }); // CAS matched nothing — someone else transitioned it
    const reread = chain({ data: { ...baseCase, status: "resolved" } });
    fromMock.mockReturnValueOnce(existing).mockReturnValueOnce(update).mockReturnValueOnce(reread);

    const res = await PATCH(patchReq({ status: "resolved" }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { case: { status: string } };
    expect(body.case.status).toBe("resolved");
  });

  it("non-status update: does not apply a status CAS filter", async () => {
    const existing = chain({ data: { id: "case-1", insurer_id: INSURER_ID, status: "open" } });
    const update = chain({ data: { ...baseCase, status: "open", title: "new" } });
    const logInsert = chain({ data: null });
    fromMock.mockReturnValueOnce(existing).mockReturnValueOnce(update).mockReturnValueOnce(logInsert);

    const res = await PATCH(patchReq({ title: "new" }), ctx);
    expect(res.status).toBe(200);
    const statusFilterCalls = update.eq.mock.calls.filter((c) => c[0] === "status");
    expect(statusFilterCalls).toHaveLength(0);
  });
});

describe("GET /api/insurer/cases/[id] [添付のダウンロード URL]", () => {
  beforeEach(() => {
    resolveCallerMock.mockReset().mockResolvedValue({ insurerId: INSURER_ID, insurerUserId: "iu-1", userId: "u-1" });
    rateLimitMock.mockReset().mockResolvedValue(null);
    fromMock.mockReset();
    storageFromMock.mockReset();
  });

  it("添付に、非公開の case-attachments の署名 URL を付けて返す（以前は storage_path だけで開けなかった）", async () => {
    const list = (data: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const k of ["select", "eq"]) c[k] = () => c;
      c.order = () => Promise.resolve({ data, error: null });
      return c;
    };
    fromMock.mockImplementation((table: string) =>
      table === "insurer_cases"
        ? chain({ data: baseCase })
        : table === "insurer_case_attachments"
          ? list([{ id: "a1", storage_path: `${INSURER_ID}/case-1/u_doc.pdf`, file_name: "doc.pdf" }])
          : list([]),
    );
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}?token=x` })),
      error: null,
    }));
    storageFromMock.mockReturnValue({ createSignedUrls });

    const res = await GET(new Request("http://localhost/api/insurer/cases/case-1") as unknown as NextRequest, ctx);
    expect(res.status).toBe(200);
    expect(storageFromMock).toHaveBeenCalledWith("case-attachments");
    const body = await res.json();
    expect(body.attachments[0].url).toBe(`https://s/${INSURER_ID}/case-1/u_doc.pdf?token=x`);
  });
});
