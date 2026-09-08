/**
 * /api/signup のテスト。
 *
 * B-H3 是正の回帰確認: パスワード登録・パスワードレス登録のどちらも
 * `email_confirm: false` でユーザーを作成し、必ず確認メール
 * (signInWithOtp) を送ること。以前はパスワード登録だけ email_confirm: true
 * で即ログイン可能になっており、被害者のメールアドレスでも
 * テナント (owner) を確認済みで作成できてしまっていた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const h: any = {
    createUserCalls: [] as any[],
    signInWithOtpCalls: [] as any[],
    createUserError: null as any,
    otpError: null as any,
  };

  h.makeServiceRoleAdmin = () => ({
    auth: {
      admin: {
        createUser: async (opts: any) => {
          h.createUserCalls.push(opts);
          if (h.createUserError) return { data: null, error: h.createUserError };
          return { data: { user: { id: "user-1" } }, error: null };
        },
        deleteUser: async () => ({ error: null }),
      },
    },
    from: (table: string) => {
      const chain: any = {
        insert: () => chain,
        select: () => chain,
        eq: () => chain,
        delete: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => {
          if (table === "tenants") return { data: { id: "tenant-1" }, error: null };
          return { data: null, error: null };
        },
        then: (res: any) => Promise.resolve({ data: null, error: null }).then(res),
      };
      return chain;
    },
  });

  h.makeServerClient = () => ({
    auth: {
      signInWithOtp: async (opts: any) => {
        h.signInWithOtpCalls.push(opts);
        return { error: h.otpError };
      },
    },
  });

  return h;
});

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => h.makeServiceRoleAdmin() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.makeServerClient() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, delete: () => {} }) }));
vi.mock("@/lib/slack", () => ({ notifySlack: async () => {} }));

import { POST } from "../route";

function req(body: any) {
  return new Request("http://localhost/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  h.createUserCalls = [];
  h.signInWithOtpCalls = [];
  h.createUserError = null;
  h.otpError = null;
});

describe("POST /api/signup", () => {
  it("パスワード登録は email_confirm: false で作成し、確認メールを送る (B-H3 回帰確認)", async () => {
    const res: any = await POST(
      req({
        email: "victim@example.co.jp",
        password: "P@ssw0rd123",
        shop_name: "テスト工房",
      }),
    );
    expect(res.status).toBe(201);
    expect(h.createUserCalls.length).toBe(1);
    expect(h.createUserCalls[0].email_confirm).toBe(false);
    expect(h.createUserCalls[0].password).toBe("P@ssw0rd123");
    expect(h.signInWithOtpCalls.length).toBe(1);
    expect(h.signInWithOtpCalls[0].email).toBe("victim@example.co.jp");
  });

  it("パスワードレス登録も email_confirm: false で作成する", async () => {
    const res: any = await POST(
      req({
        email: "owner@example.co.jp",
        passwordless: true,
        shop_name: "テスト工房2",
      }),
    );
    expect(res.status).toBe(201);
    expect(h.createUserCalls[0].email_confirm).toBe(false);
    expect(h.createUserCalls[0].password).toBeUndefined();
    expect(h.signInWithOtpCalls.length).toBe(1);
  });
});
