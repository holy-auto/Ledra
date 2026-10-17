/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/agent/apply — 未ログインの申請で、メールが既存アカウント（代理店登録済みを含む）か
 * どうかが応答で分からないこと（signup / join/send-code の B-M3 是正と同じ）。
 * 以前は既存アカウントで linked_existing_account: true、代理店登録済みで 409 + agent_status を返していた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  sessionUser: null as null | { id: string },
  authUsers: [] as { id: string; email: string }[],
  activeAgentUserIds: new Set<string>(),
}));

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSec: 0 })),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/agent/email", () => ({ notifyApplicationReceived: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    auth: { admin: { listUsers: async () => ({ data: { users: state.authUsers } }) } },
    from: (table: string) => {
      if (table === "agent_applications") return { insert: async () => ({ error: null }) };
      let uid = "";
      const q: any = {
        select: () => q,
        eq: (k: string, v: string) => (k === "user_id" ? (uid = v) : null, q),
        maybeSingle: async () => ({
          data: state.activeAgentUserIds.has(uid) ? { agent_id: "ag", agents: { id: "ag", status: "active" } } : null,
        }),
      };
      return q;
    },
  }),
}));

import { POST } from "../route";

const apply = (email: string) =>
  POST(
    new Request("http://localhost/api/agent/apply", {
      method: "POST",
      body: JSON.stringify({
        company_name: "株式会社テスト",
        contact_name: "山田",
        email,
        phone: "0312345678",
        address: "東京都",
        terms_accepted: true,
      }),
    }) as any,
  );

const shape = async (res: Response) => {
  const { application_number, ...rest } = await res.json();
  return { status: res.status, numbered: typeof application_number === "string", ...rest };
};

beforeEach(() => {
  state.sessionUser = null;
  state.authUsers = [
    { id: "u-existing", email: "existing@example.com" },
    { id: "u-agent", email: "agent@example.com" },
  ];
  state.activeAgentUserIds = new Set(["u-agent"]);
});

describe("POST /api/agent/apply — 未ログイン時のアカウント列挙", () => {
  it("新規・既存アカウント・代理店登録済みのメールで応答が同じ", async () => {
    const fresh = await shape(await apply("new@example.com"));
    expect(fresh).toMatchObject({ status: 201, ok: true, numbered: true });
    expect(await shape(await apply("existing@example.com"))).toEqual(fresh);
    expect(await shape(await apply("agent@example.com"))).toEqual(fresh);
  });

  it("ログイン本人が代理店登録済みなら 409 を返す（自分の状態なので列挙にならない）", async () => {
    state.sessionUser = { id: "u-agent" };
    expect((await apply("whatever@example.com")).status).toBe(409);
  });
});
