/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/certificates の adapter behavior をテストする。
 *
 * Server Action (createCertAction) はモックし、本ハンドラの責務だけを検証する:
 *   - JSON validation
 *   - JSON → FormData 変換
 *   - withIdempotency の通過 (key 未指定で素通り)
 *   - createCertAction の戻り値マッピング (ok/unauthorized/error)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createCertAction: vi.fn(),
  withIdempotency: vi.fn(),
}));

vi.mock("@/app/admin/certificates/new/actions", () => ({
  createCertAction: mocks.createCertAction,
}));
vi.mock("@/lib/api/idempotency", () => ({
  // key 未指定時の挙動を再現: handler をそのまま実行
  withIdempotency: (_req: unknown, _scope: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/admin/certificates/route";

beforeEach(() => {
  mocks.createCertAction.mockReset();
});

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/certificates", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/admin/certificates (JSON adapter)", () => {
  it("returns 400 on invalid payload (missing customer_name)", async () => {
    const res = (await POST(makeReq({}))) as Response;
    expect(res.status).toBe(400);
    expect(mocks.createCertAction).not.toHaveBeenCalled();
  });

  it("invokes createCertAction with a FormData carrying parsed fields", async () => {
    mocks.createCertAction.mockResolvedValueOnce({ ok: true, public_id: "P-123" });
    const res = (await POST(
      makeReq({
        customer_name: "田中太郎",
        mileage_km: 35000,
        vehicle_maker: "トヨタ",
        model: "プリウス",
        template_fields: { with_wax: true },
      }),
    )) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; public_id: string };
    expect(body.ok).toBe(true);
    expect(body.public_id).toBe("P-123");

    expect(mocks.createCertAction).toHaveBeenCalledTimes(1);
    const fd = mocks.createCertAction.mock.calls[0][0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("customer_name")).toBe("田中太郎");
    expect(fd.get("vehicle_maker")).toBe("トヨタ");
    expect(fd.get("model")).toBe("プリウス");
    expect(fd.get("f__with_wax")).toBe("on");
    expect(fd.get("status")).toBe("active");
  });

  it("maps unauthorized result to 401", async () => {
    mocks.createCertAction.mockResolvedValueOnce({ ok: false, error: "unauthorized" });
    const res = (await POST(makeReq({ customer_name: "x", mileage_km: 35000 }))) as Response;
    expect(res.status).toBe(401);
  });

  it("maps other action errors to 400 validation error", async () => {
    mocks.createCertAction.mockResolvedValueOnce({ ok: false, error: "vehicle_required" });
    const res = (await POST(makeReq({ customer_name: "x", mileage_km: 35000 }))) as Response;
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("vehicle_required");
  });

  it("returns 500 when createCertAction throws", async () => {
    mocks.createCertAction.mockRejectedValueOnce(new Error("boom"));
    const res = (await POST(makeReq({ customer_name: "x", mileage_km: 35000 }))) as Response;
    expect(res.status).toBe(500);
  });
});
