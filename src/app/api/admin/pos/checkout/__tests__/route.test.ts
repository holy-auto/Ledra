/**
 * admin/pos/checkout POST integration test.
 *
 * Verifies the contract that protects POS reliability:
 *   - 401 on missing caller, 403 on insufficient role, 429 on rate limit
 *   - calls `pos_checkout` RPC with the correct tenant scope + payload
 *   - on RPC error returns 500
 *   - inventory deduction runs after a successful RPC and reports stats
 *     including the new `retryQueued` field from the outbox fallback path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCallerMock, requireMinRoleMock, checkRateLimitMock, rpcMock, deductInventoryMock } = vi.hoisted(() => ({
  resolveCallerMock: vi.fn(),
  requireMinRoleMock: vi.fn().mockReturnValue(true),
  checkRateLimitMock: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 }),
  rpcMock: vi.fn(),
  deductInventoryMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ rpc: rpcMock }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  // pos_checkout は SECURITY DEFINER で service_role 専用にしたため、
  // ルートはサービスロールのクライアントで RPC を呼ぶ。
  // その admin にも rpc を生やしておく
  createTenantScopedAdmin: (tenantId: string) => ({
    admin: { __scopedTenantId: tenantId, rpc: rpcMock },
    tenantId,
  }),
}));

vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: (...args: unknown[]) => resolveCallerMock(...args),
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/pos/inventoryDeduction", () => ({
  deductInventoryForPosItems: (...args: unknown[]) => deductInventoryMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { POST } from "@/app/api/admin/pos/checkout/route";
import { NextRequest } from "next/server";

const validBody = {
  amount: 1000,
  payment_method: "cash",
  tax_rate: 10,
  items_json: [{ inventory_item_id: "itm-1", quantity: 2, name: "ワックス" }],
};

function jsonReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/pos/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/admin/pos/checkout", () => {
  beforeEach(() => {
    resolveCallerMock.mockReset();
    requireMinRoleMock.mockReset().mockReturnValue(true);
    checkRateLimitMock.mockReset().mockResolvedValue({ allowed: true, retryAfterSec: 0, remaining: 9 });
    rpcMock.mockReset();
    deductInventoryMock.mockReset().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0, retryQueued: 0 });
  });

  it("returns 401 when caller cannot be resolved", async () => {
    resolveCallerMock.mockResolvedValueOnce(null);
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller's role is below staff", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
    requireMinRoleMock.mockReturnValueOnce(false);
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate-limited", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfterSec: 30, remaining: 0 });
    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(429);
  });

  it("returns 400 when payload validation fails", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
    const res = await POST(jsonReq({ amount: -1, payment_method: "cash" }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls pos_checkout RPC with tenant scope and returns 500 on RPC error", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "tenant-A" });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "advisory lock contention" } });

    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(500);
    expect(rpcMock).toHaveBeenCalledWith(
      "pos_checkout",
      expect.objectContaining({ p_tenant_id: "tenant-A", p_amount: 1000 }),
    );
    expect(deductInventoryMock).not.toHaveBeenCalled();
  });

  it("on RPC success: runs inventory deduction with outboxAdmin and returns combined stats", async () => {
    resolveCallerMock.mockResolvedValueOnce({ userId: "u-1", tenantId: "tenant-A" });
    rpcMock.mockResolvedValueOnce({ data: { payment_id: "pay-9" }, error: null });
    deductInventoryMock.mockResolvedValueOnce({ attempted: 1, succeeded: 0, failed: 1, retryQueued: 1 });

    const res = await POST(jsonReq(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { payment_id: string };
      inventory: { attempted: number; failed: number; retryQueued: number };
    };
    expect(body.result.payment_id).toBe("pay-9");
    expect(body.inventory).toEqual({ attempted: 1, succeeded: 0, failed: 1, retryQueued: 1 });

    // outboxAdmin is the tenant-scoped admin client — assert deductInventory got it.
    const deductArgs = deductInventoryMock.mock.calls[0][2] as {
      tenantId: string;
      paymentId: string;
      outboxAdmin: { __scopedTenantId: string };
    };
    expect(deductArgs.tenantId).toBe("tenant-A");
    expect(deductArgs.paymentId).toBe("pay-9");
    expect(deductArgs.outboxAdmin.__scopedTenantId).toBe("tenant-A");
  });
});
