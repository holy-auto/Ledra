/**
 * 保険会社登録 (join) の OTP フローのテスト。
 *
 * G-H2 是正の回帰確認: send-code を複数回叩くだけで(コードを一度も入力せずに)
 * /api/join の「メール確認済み」判定を通過できてはならない。
 * あわせて、正規のフロー(send-code → verify-code → join)は引き続き通ることを確認する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const h: any = {
    rows: [] as any[],
    nextId: 1,
    lastEmailHtml: "" as string,
  };

  function makeQueryable() {
    const filters: Array<(r: any) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: any = null;
    let orderDesc = false;
    let limitN: number | null = null;
    let inserted: any[] = [];
    function apply() {
      let out = h.rows.filter((r: any) => filters.every((f) => f(r)));
      if (orderDesc) out = [...out].sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    }
    function run(single: boolean) {
      if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
      if (op === "update") {
        const targets = h.rows.filter((r: any) => filters.every((f) => f(r)));
        for (const r of targets) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const out = apply();
      return { data: single ? (out[0] ?? null) : out, error: null };
    }
    const b: any = {
      select: () => b,
      order: (_c: string, opts?: { ascending?: boolean }) => ((orderDesc = opts?.ascending === false), b),
      limit: (n: number) => ((limitN = n), b),
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
      gt: (c: string, v: any) => (filters.push((r) => r[c] > v), b),
      insert: (p: any) => {
        op = "insert";
        payload = p;
        inserted = (Array.isArray(p) ? p : [p]).map((x) => ({
          ...x,
          id: `row-${h.nextId++}`,
          created_at: new Date().toISOString(),
        }));
        h.rows.push(...inserted);
        return b;
      },
      update: (p: any) => ((op = "update"), (payload = p), b),
      single: () => Promise.resolve(run(true)),
      maybeSingle: () => Promise.resolve(run(true)),
      then: (res: any, rej: any) => Promise.resolve(run(false)).then(res, rej),
    };
    return b;
  }

  h.makeAdmin = () => ({
    from: (table: string) => {
      if (table !== "insurer_email_verifications") throw new Error(`unexpected table: ${table}`);
      return makeQueryable();
    },
    rpc: async (fn: string) => {
      if (fn === "check_auth_email_exists") return { data: false, error: null };
      throw new Error(`unexpected rpc: ${fn}`);
    },
  });

  return h;
});

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => h.makeAdmin() }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/email/sendEmail", () => ({
  sendEmail: async (msg: { html?: string }) => {
    h.lastEmailHtml = msg.html ?? "";
    return { ok: true };
  },
}));

import { POST as sendCode } from "../send-code/route";
import { POST as verifyCode } from "../verify-code/route";
import { POST as join } from "../route";

const EMAIL = "victim@example.co.jp";

function jsonReq(body: any) {
  return { json: async () => body, url: "http://localhost/api/join" } as any;
}

function extractCode(html: string): string {
  const m = html.match(/letter-spacing: 8px;[^>]*>(\d{6})</);
  if (!m) throw new Error("code not found in email html");
  return m[1];
}

function joinBody(overrides: Record<string, unknown> = {}) {
  return {
    business_type: "corporation",
    company_name: "テスト損保",
    contact_person: "山田太郎",
    email: EMAIL,
    phone: "0312345678",
    password: "P@ssw0rd12345",
    requested_plan: "basic",
    terms_accepted: true,
    ...overrides,
  };
}

beforeEach(() => {
  h.rows = [];
  h.nextId = 1;
  h.lastEmailHtml = "";
});

describe("送信のみ（コード未入力）では登録を完了できない (G-H2 回帰確認)", () => {
  it("send-code を2回叩いても /api/join は確認未完了として拒否する", async () => {
    const res1: any = await sendCode(jsonReq({ email: EMAIL }));
    expect(res1.status).toBe(200);
    const res2: any = await sendCode(jsonReq({ email: EMAIL }));
    expect(res2.status).toBe(200);

    // 是正前は1回目の行が誤って verified=true になっていた。
    const verifiedRows = h.rows.filter((r: any) => r.verified === true);
    expect(verifiedRows.length).toBe(0);

    const joinRes: any = await join(jsonReq(joinBody()));
    expect(joinRes.status).toBe(400);
  });
});

describe("正規のフロー", () => {
  it("send-code → 正しいコードで verify-code → join のメール確認判定を通過する", async () => {
    const res1: any = await sendCode(jsonReq({ email: EMAIL }));
    expect(res1.status).toBe(200);
    const code = extractCode(h.lastEmailHtml);

    const verifyRes: any = await verifyCode(jsonReq({ email: EMAIL, code }));
    expect(verifyRes.status).toBe(200);

    const verifiedRows = h.rows.filter((r: any) => r.verified === true);
    expect(verifiedRows.length).toBe(1);

    // /api/join 側の確認クエリ相当（RPC 呼び出し以降は別関心事なので、
    // ここでは「確認未完了」400 にならないことだけを見る）。
    const joinRes: any = await join(jsonReq(joinBody()));
    const joinBodyOut = await joinRes.json();
    expect(joinBodyOut.message).not.toContain("確認");
  });

  it("誤ったコードは拒否される（定数時間比較でも一致しないものは弾く）", async () => {
    await sendCode(jsonReq({ email: EMAIL }));
    const res: any = await verifyCode(jsonReq({ email: EMAIL, code: "000000" }));
    expect(res.status).toBe(400);
    expect(h.rows.some((r: any) => r.verified === true)).toBe(false);
  });
});
