/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PUT /api/admin/certificates/status の「写真添付必須」ゲートを検証する。
 *
 * - draft→active で写真が無い → 400 (発行ブロック)、update も発行フックも走らない
 * - draft→active で写真あり → 200、発行フック (triggerCertificateIssued) が 1 回
 * - void→active (再発行) で写真あり → 200 だが発行フックは走らない (二重通知防止)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  hasPhotos: vi.fn(),
  hasBeforeAfter: vi.fn(),
  issued: vi.fn(),
  enqueue: vi.fn(),
  update: vi.fn(),
  fetchResult: { data: null as any, error: null as any },
  updateResult: { data: null as any, error: null as any },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    tenantId: "tenant-1",
    admin: {
      from: () => {
        const b: any = {
          select: () => b,
          eq: () => b,
          limit: () => b,
          update: (...args: any[]) => {
            mocks.update(...args);
            return b;
          },
          maybeSingle: () => Promise.resolve(mocks.fetchResult),
          single: () => Promise.resolve(mocks.updateResult),
        };
        return b;
      },
    },
  }),
}));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCaller,
  requireMinRole: () => true,
}));
vi.mock("@/lib/certificates/photoRequirement", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    certificateHasRequiredPhotos: mocks.hasPhotos,
    certificateHasRequiredBeforeAfterMedia: mocks.hasBeforeAfter,
  };
});
vi.mock("@/lib/certificates/issueHooks", () => ({ triggerCertificateIssued: mocks.issued }));
vi.mock("@/lib/anchoring/certificateAnchorService", () => ({ enqueueCertificateAnchor: mocks.enqueue }));
vi.mock("@/lib/audit/certificateLog", () => ({
  logCertificateAction: vi.fn(),
  getRequestMeta: () => ({ ip: null, userAgent: null }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { PUT } from "@/app/api/admin/certificates/status/route";

function req(body: unknown) {
  return new Request("http://localhost/api/admin/certificates/status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const CERT = {
  id: "c1",
  vehicle_id: "v1",
  customer_id: "cust1",
  customer_name: "田中太郎",
  vehicle_info_json: { model: "プリウス", plate: "品川 300 あ 12-34" },
  service_type: "coating",
  created_by: "u1",
};

beforeEach(() => {
  mocks.resolveCaller.mockReset();
  mocks.hasPhotos.mockReset();
  mocks.hasBeforeAfter.mockReset().mockResolvedValue(true);
  mocks.issued.mockReset().mockResolvedValue(undefined);
  mocks.enqueue.mockReset().mockResolvedValue({ queued: false, reason: "disabled" });
  mocks.update.mockReset();
  mocks.resolveCaller.mockResolvedValue({ tenantId: "tenant-1", userId: "u1", role: "admin" });
  mocks.updateResult = { data: { id: "c1", public_id: "P-1", status: "active" }, error: null };
});

describe("PUT /api/admin/certificates/status — photo gate", () => {
  it("draft→active で写真ゼロは 400 でブロックし、update も発行フックも呼ばない", async () => {
    mocks.fetchResult = { data: { ...CERT, status: "draft" }, error: null };
    mocks.hasPhotos.mockResolvedValue(false);

    const res = (await PUT(req({ public_id: "P-1", status: "active" }))) as Response;
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.issued).not.toHaveBeenCalled();
  });

  it("draft→active で写真ありは 200、発行フックが 1 回走る", async () => {
    mocks.fetchResult = { data: { ...CERT, status: "draft" }, error: null };
    mocks.hasPhotos.mockResolvedValue(true);

    const res = (await PUT(req({ public_id: "P-1", status: "active" }))) as Response;
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.issued).toHaveBeenCalledTimes(1);
    expect(mocks.issued.mock.calls[0][0]).toMatchObject({
      tenantId: "tenant-1",
      publicId: "P-1",
      certificateId: "c1",
      customerName: "田中太郎",
      vehicleModel: "プリウス",
    });
    // draft→active のレコードアンカーは issueHooks 側で積むため、ここでは直接 enqueue しない
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("void→active (再発行) は写真ありでも発行フックを走らせない", async () => {
    mocks.fetchResult = { data: { ...CERT, status: "void" }, error: null };
    mocks.hasPhotos.mockResolvedValue(true);

    const res = (await PUT(req({ public_id: "P-1", status: "active" }))) as Response;
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.issued).not.toHaveBeenCalled();
    // draft→active 以外 (再発行/void 等) は証明書レコードアンカーを直接 queue する
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue.mock.calls[0][0]).toMatchObject({ tenantId: "tenant-1", certificateId: "c1" });
  });

  it("coating で Before/After 写真が無いと 400 でブロックする", async () => {
    mocks.fetchResult = { data: { ...CERT, status: "draft" }, error: null };
    mocks.hasPhotos.mockResolvedValue(true);
    mocks.hasBeforeAfter.mockResolvedValue(false);

    const res = (await PUT(req({ public_id: "P-1", status: "active" }))) as Response;
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.issued).not.toHaveBeenCalled();
  });
});
