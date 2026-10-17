import { describe, it, expect, vi, beforeEach } from "vitest";

// デモの入口はパスワードを使わない（公開パスワードを変えられると入口が止まるため）。
// 要点: magic link のトークンを発行して verify する／同時アクセスで負けたら1回だけ取り直す。

const mocks = vi.hoisted(() => ({
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({ auth: { admin: { generateLink: mocks.generateLink } } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, signInWithPassword: mocks.signInWithPassword },
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { GET } from "@/app/(marketing)/demo/enter/route";
import { NextRequest } from "next/server";

const req = () => new NextRequest("https://ledra.test/demo/enter");
const link = (hash: string) => ({ data: { properties: { hashed_token: hash } }, error: null });

beforeEach(() => vi.clearAllMocks());

describe("GET /demo/enter", () => {
  it("magic link のトークンで verify し、パスワードでは入らない", async () => {
    mocks.generateLink.mockResolvedValue(link("h1"));
    mocks.verifyOtp.mockResolvedValue({ error: null });

    const res = await GET(req());

    expect(res.headers.get("location")).toBe("https://ledra.test/admin/certificates");
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "demo@ledra-motors.example" });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "h1" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith("active_context", "shop", expect.any(Object));
  });

  it("verify に負けたら1回だけ取り直す", async () => {
    mocks.generateLink.mockResolvedValueOnce(link("h1")).mockResolvedValueOnce(link("h2"));
    mocks.verifyOtp.mockResolvedValueOnce({ error: new Error("expired") }).mockResolvedValueOnce({ error: null });

    const res = await GET(req());

    expect(res.headers.get("location")).toBe("https://ledra.test/admin/certificates");
    expect(mocks.verifyOtp).toHaveBeenLastCalledWith({ type: "magiclink", token_hash: "h2" });
  });

  it("2回とも失敗したら /demo?e=1 に戻す", async () => {
    mocks.generateLink.mockResolvedValue(link("h"));
    mocks.verifyOtp.mockResolvedValue({ error: new Error("expired") });

    const res = await GET(req());

    expect(res.headers.get("location")).toBe("https://ledra.test/demo?e=1");
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(2);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
