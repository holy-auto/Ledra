/**
 * F-1（PR-5）: withCaller の実際の分岐を確認する。
 * 「その語が書かれている」ではなく「値が通るか」を確認する（MISTAKE_LEDGER 型G対策）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveCallerWithRoleMock, checkRateLimitMock } = vi.hoisted(() => ({
  resolveCallerWithRoleMock: vi.fn(),
  checkRateLimitMock: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ __fake: "supabase" }),
}));

vi.mock("@/lib/auth/checkRole", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/checkRole")>();
  return {
    ...actual,
    resolveCallerWithRole: resolveCallerWithRoleMock,
  };
});

vi.mock("@/lib/api/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rateLimit")>();
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
  };
});

import { withCaller } from "@/lib/api/withCaller";
import { apiOk } from "@/lib/api/response";

const CALLER = { userId: "u1", tenantId: "t1", role: "admin" as const, planTier: "pro" as const };

function req(url = "https://app.example.com/api/x") {
  return new Request(url) as unknown as import("next/server").NextRequest;
}

describe("withCaller", () => {
  beforeEach(() => {
    resolveCallerWithRoleMock.mockReset();
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(null);
  });

  it("未認証なら 401 を返し、ハンドラを呼ばない", async () => {
    resolveCallerWithRoleMock.mockResolvedValue(null);
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller(handler);

    const res = await route(req());

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("minRole を満たさなければ 403 を返す", async () => {
    resolveCallerWithRoleMock.mockResolvedValue({ ...CALLER, role: "staff" });
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller(handler, { minRole: "owner" });

    const res = await route(req());

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("permission を満たさなければ 403 を返す", async () => {
    resolveCallerWithRoleMock.mockResolvedValue({ ...CALLER, role: "viewer" });
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller(handler, { permission: "members:manage" });

    const res = await route(req());

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("条件を満たせばハンドラを呼び、caller/supabase を渡す", async () => {
    resolveCallerWithRoleMock.mockResolvedValue(CALLER);
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller(handler, { minRole: "staff", permission: "dashboard:view" });

    const res = await route(req());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    const [, ctx] = handler.mock.calls[0];
    expect(ctx.caller).toEqual(CALLER);
    expect(ctx.supabase).toEqual({ __fake: "supabase" });
    expect(ctx.params).toBeUndefined();
  });

  it("rateLimit オプション指定時、制限に達していたらハンドラを呼ばずそのレスポンスを返す", async () => {
    const limitedResponse = new Response("rate limited", { status: 429 });
    checkRateLimitMock.mockResolvedValue(limitedResponse);
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller(handler, { rateLimit: "general" });

    const res = await route(req());

    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(resolveCallerWithRoleMock).not.toHaveBeenCalled();
  });

  it("動的ルートの params を await して ctx.params に渡す", async () => {
    resolveCallerWithRoleMock.mockResolvedValue(CALLER);
    const handler = vi.fn().mockResolvedValue(apiOk({ ok: true }));
    const route = withCaller<{ id: string }>(handler);

    await route(req(), { params: Promise.resolve({ id: "cert-1" }) });

    expect(handler).toHaveBeenCalledOnce();
    const [, ctx] = handler.mock.calls[0];
    expect(ctx.params).toEqual({ id: "cert-1" });
  });

  it("ハンドラが例外を投げたら apiInternalError（500）に変換する", async () => {
    resolveCallerWithRoleMock.mockResolvedValue(CALLER);
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const route = withCaller(handler);

    const res = await route(req());

    expect(res.status).toBe(500);
  });
});
