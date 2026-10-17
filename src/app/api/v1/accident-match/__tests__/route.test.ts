/**
 * GET /api/v1/accident-match — 月間クォータ（verify / marketplace-info と同じ）を超えたら照合せず 429。
 */
import { describe, it, expect, vi } from "vitest";

const m = vi.hoisted(() => ({
  checkPassportMonthlyQuota: vi.fn(),
  matchShopsForAccident: vi.fn(),
}));

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({}) }));
vi.mock("@/lib/passport/api/keys", () => ({
  extractBearer: () => "lpk_live_x",
  resolvePassportApiKey: async () => ({
    ok: true,
    ctx: { keyId: "k", consumerId: "c", monthlyQuota: 100, rateLimitPerMinute: 60, scopes: ["accident:match"] },
  }),
  hasPassportScope: () => true,
  logPassportApiCall: vi.fn(),
  checkPassportMonthlyQuota: m.checkPassportMonthlyQuota,
}));
vi.mock("@/lib/accident-match/match", () => ({ matchShopsForAccident: m.matchShopsForAccident }));

import { GET } from "../route";

describe("GET /api/v1/accident-match — 月間クォータ", () => {
  it("上限を超えたら 429 を返し、照合しない", async () => {
    m.checkPassportMonthlyQuota.mockResolvedValue({ allowed: false, used: 100, limit: 100 });
    const res = await GET(new Request("http://localhost/api/v1/accident-match?vin=JTDBR32E720123456") as never);
    expect(res.status).toBe(429);
    expect(m.checkPassportMonthlyQuota).toHaveBeenCalledWith({}, "c", 100);
    expect(m.matchShopsForAccident).not.toHaveBeenCalled();
  });
});
