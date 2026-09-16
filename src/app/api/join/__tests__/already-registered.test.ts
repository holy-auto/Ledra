/**
 * POST /api/join — B-M3 回帰確認。
 *
 * OTP 確認済みのメールで登録を完了しようとした際、Supabase Auth 側に
 * 既に同じメールのユーザーが存在する場合、以前は 409 を返していた。
 * 一律 200 (未登録時の成功と見分けの付かない形) にし、本人にだけ
 * 案内メールを送るよう是正した。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  sentEmails: [] as any[],
  createUserCalls: [] as any[],
}));

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: async (msg: any) => {
    h.sentEmails.push(msg);
    return { ok: true };
  },
}));

const VERIFIED_ROW = { id: "v1", verified: true };

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    auth: {
      admin: {
        createUser: async (opts: any) => {
          h.createUserCalls.push(opts);
          return { data: null, error: { message: "A user with this email address has already been registered" } };
        },
      },
    },
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "insurer_email_verifications") return { data: VERIFIED_ROW, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    },
  }),
}));

import { POST } from "../route";

function jsonReq(body: any) {
  return { json: async () => body, url: "http://localhost/api/join" } as any;
}

beforeEach(() => {
  h.sentEmails = [];
  h.createUserCalls = [];
});

describe("POST /api/join — 既に登録済みのメール (B-M3 回帰確認)", () => {
  it("409 ではなく成功と同じ形の 200 を返し、本人に案内メールを送る", async () => {
    const res: any = await POST(
      jsonReq({
        business_type: "sole_proprietor",
        company_name: "テスト損保",
        contact_person: "山田太郎",
        email: "existing@example.co.jp",
        phone: "0312345678",
        password: "P@ssw0rd12345",
        requested_plan: "basic",
        terms_accepted: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(h.createUserCalls.length).toBe(1);
    // 案内メール送信は fire-and-forget なので少し待つ。
    await new Promise((r) => setTimeout(r, 0));
    expect(h.sentEmails.length).toBe(1);
    expect(h.sentEmails[0].to).toBe("existing@example.co.jp");
  });
});
