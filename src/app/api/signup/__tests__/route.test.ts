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
    sendEmailCalls: [] as any[],
    rpcCalls: [] as any[],
    createUserError: null as any,
    otpError: null as any,
    // 既存アカウントの確認状態。デフォルトは確認済み(false)= 既存の
    // 「登録済みです」案内メール経路。true にすると未確認retry経路になる。
    emailUnconfirmed: false,
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
    rpc: async (name: string, args: any) => {
      h.rpcCalls.push({ name, args });
      if (name === "check_auth_email_unconfirmed") {
        return { data: h.emailUnconfirmed, error: null };
      }
      return { data: null, error: null };
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
vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: async (msg: any) => {
    h.sendEmailCalls.push(msg);
    return { ok: true };
  },
}));

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
  h.sendEmailCalls = [];
  h.rpcCalls = [];
  h.createUserError = null;
  h.otpError = null;
  h.emailUnconfirmed = false;
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

  // B-M3 回帰確認 (2026-09-08): 既に登録済み・確認済みのメールでも 409 ではなく、
  // 未登録時と見分けの付かない成功レスポンスを返す（列挙オラクル対策）。
  it("既に登録済み・確認済みのメールでは「登録済みです」の案内メールを送る", async () => {
    h.createUserError = { message: "A user with this email address has already been registered" };
    h.emailUnconfirmed = false; // 確認済み
    const res: any = await POST(
      req({
        email: "existing@example.co.jp",
        password: "P@ssw0rd123",
        shop_name: "テスト工房3",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // テナントも作らない。
    expect(h.signInWithOtpCalls.length).toBe(0);
    // 本人にだけ案内メールを送る。
    expect(h.sendEmailCalls.length).toBe(1);
    expect(h.sendEmailCalls[0].to).toBe("existing@example.co.jp");
  });

  // code-review 回帰確認 (2026-09-08): 既存アカウントがまだメール未確認の場合、
  // 「登録済みです、ログインしてください」の案内だけ送るとログインできない
  // アカウントへの案内になり本人が詰まる。確認メールを再送すること。
  it("既に登録済みだが未確認のメールでは確認メールを再送する（「登録済みです」案内は送らない）", async () => {
    h.createUserError = { message: "A user with this email address has already been registered" };
    h.emailUnconfirmed = true; // 未確認
    const res: any = await POST(
      req({
        email: "unconfirmed@example.co.jp",
        password: "P@ssw0rd123",
        shop_name: "テスト工房4",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // 確認メール(signInWithOtp)を再送する。
    expect(h.signInWithOtpCalls.length).toBe(1);
    expect(h.signInWithOtpCalls[0].email).toBe("unconfirmed@example.co.jp");
    // 「登録済みです」の案内メールは送らない（誤誘導になるため）。
    expect(h.sendEmailCalls.length).toBe(0);
  });
});
