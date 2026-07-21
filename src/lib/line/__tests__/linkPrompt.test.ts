/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// buildLineLinkPrompt の送信タイミング (後ろ倒し) を検証する。
// 実装は Supabase admin (count クエリ) と intake 招待発行に依存するため、両方をモックする。

const mocks = vi.hoisted(() => ({
  createServiceRoleAdmin: vi.fn(),
  createIntakeInvitation: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: mocks.createServiceRoleAdmin }));
vi.mock("@/lib/identity/intakeServer", () => ({ createIntakeInvitation: mocks.createIntakeInvitation }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

const TENANT = "11111111-1111-1111-1111-111111111111";
const LINE_USER = "Uabcdef0123456789abcdef0123456789";

/**
 * buildLineLinkPrompt が投げる 3 クエリを満たす最小の fluent モック:
 *  1. tenants … .single()                         → { line_link_prompt_enabled }
 *  2. customer_messages 受信数カウント (await)     → { count: inboundCount }
 *  3. customer_messages クールダウンカウント (await) → { count: cooldownCount }
 * 2 と 3 は同じ customer_messages だが、3 だけ ilike/gte を呼ぶので、それを見て区別する。
 */
function adminMock(opts: { promptEnabled: boolean; inboundCount: number; cooldownCount?: number }) {
  return {
    from(table: string) {
      if (table === "tenants") {
        const b: any = {
          select: () => b,
          eq: () => b,
          single: async () => ({ data: { line_link_prompt_enabled: opts.promptEnabled }, error: null }),
        };
        return b;
      }
      let cooldown = false; // ilike/gte が来たらクールダウンクエリ
      const b: any = {
        select: () => b,
        eq: () => b,
        ilike: () => {
          cooldown = true;
          return b;
        },
        gte: () => {
          cooldown = true;
          return b;
        },
        then: (resolve: (v: any) => void) =>
          resolve({ count: cooldown ? (opts.cooldownCount ?? 0) : opts.inboundCount, error: null }),
      };
      return b;
    },
  };
}

const ORIGINAL_ENV = { ...process.env };

/** env を上書きしてモジュールを再読込 (閾値は import 時に確定するため)。 */
async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  delete process.env.LINE_LINK_PROMPT_AFTER_INBOUND; // 既定 (4) を検証できるよう毎回クリア
  delete process.env.LINE_LINK_PROMPT_COOLDOWN_DAYS;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/line/linkPrompt");
}

beforeEach(() => {
  mocks.createServiceRoleAdmin.mockReset();
  mocks.createIntakeInvitation.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("buildLineLinkPrompt — 送信タイミング (後ろ倒し)", () => {
  it("既定では 3 通目まで案内を出さない (初っ端で連携を要求しない)", async () => {
    const { buildLineLinkPrompt } = await load();
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ promptEnabled: true, inboundCount: 3 }));
    const r = await buildLineLinkPrompt({ tenantId: TENANT, lineUserId: LINE_USER, customerId: null });
    expect(r).toBeNull();
  });

  it("既定では 4 通目の受信で案内を出す", async () => {
    const { buildLineLinkPrompt, LINK_PROMPT_MARKER } = await load({ NEXT_PUBLIC_APP_URL: "https://app.example.com" });
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ promptEnabled: true, inboundCount: 4, cooldownCount: 0 }));
    mocks.createIntakeInvitation.mockResolvedValue({ url: "https://app.example.com/intake/xxx?t=yyy" });
    const r = await buildLineLinkPrompt({ tenantId: TENANT, lineUserId: LINE_USER, customerId: null });
    expect(r?.text.startsWith(LINK_PROMPT_MARKER)).toBe(true);
  });

  it("env LINE_LINK_PROMPT_AFTER_INBOUND で閾値を上書きできる", async () => {
    const { buildLineLinkPrompt } = await load({ LINE_LINK_PROMPT_AFTER_INBOUND: "6" });
    mocks.createServiceRoleAdmin.mockReturnValue(adminMock({ promptEnabled: true, inboundCount: 4 }));
    const r = await buildLineLinkPrompt({ tenantId: TENANT, lineUserId: LINE_USER, customerId: null });
    expect(r).toBeNull(); // 4 < 6 なのでまだ出さない
  });

  it("クールダウン中 (直近に案内済み) は再送しない", async () => {
    const { buildLineLinkPrompt } = await load({ NEXT_PUBLIC_APP_URL: "https://app.example.com" });
    mocks.createServiceRoleAdmin.mockReturnValue(
      adminMock({ promptEnabled: true, inboundCount: 10, cooldownCount: 1 }),
    );
    const r = await buildLineLinkPrompt({ tenantId: TENANT, lineUserId: LINE_USER, customerId: null });
    expect(r).toBeNull();
  });

  it("既に顧客紐付け済みなら案内しない (クエリも投げない)", async () => {
    const { buildLineLinkPrompt } = await load();
    const r = await buildLineLinkPrompt({ tenantId: TENANT, lineUserId: LINE_USER, customerId: "cust-1" });
    expect(r).toBeNull();
    expect(mocks.createServiceRoleAdmin).not.toHaveBeenCalled();
  });
});
