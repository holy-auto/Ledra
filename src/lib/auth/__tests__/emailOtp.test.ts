/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * IMP-012: emailOtp.ts（email_otp_codes への IO 層）のテスト。
 * otp.ts 自体の純関数（生成・ハッシュ・検証）は otp.test.ts でカバー済みなので、
 * ここでは issueEmailOtp/confirmEmailOtp が正しく読み書きするかだけを検証する。
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueEmailOtp, confirmEmailOtp } from "../emailOtp";

const TENANT = "tenant-1";
const USER = "user-1";
const EMAIL = "owner@example.com";
const PURPOSE = "mobile_signup" as const;

/** email_otp_codes 専用の最小限 admin スタブ。insert/select/update を記録する。 */
function makeStub(opts: { row?: Record<string, any> | null } = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  let insertedPayload: Record<string, any> | null = null;

  const admin = {
    from: (table: string) => {
      if (table !== "email_otp_codes") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (payload: any) => {
          insertedPayload = payload;
          inserts.push(payload);
          return { error: null } as any;
        },
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: opts.row ?? null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: (payload: any) => {
          updates.push(payload);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { admin, inserts, updates, getInsertedPayload: () => insertedPayload };
}

describe("issueEmailOtp()", () => {
  it("6桁のコードを返し、ハッシュ化して insert する（生コードはそのまま保存しない）", async () => {
    const stub = makeStub();
    const code = await issueEmailOtp(stub.admin, { tenantId: TENANT, userId: USER, email: EMAIL, purpose: PURPOSE });

    expect(code).toMatch(/^\d{6}$/);
    expect(stub.inserts).toHaveLength(1);
    const payload = stub.getInsertedPayload()!;
    expect(payload).toMatchObject({ tenant_id: TENANT, user_id: USER, email: EMAIL, purpose: PURPOSE });
    expect(payload.code_hash).not.toBe(code);
    expect(payload.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("insert が失敗したら throw する", async () => {
    const admin = {
      from: () => ({ insert: () => ({ error: { message: "boom" } }) }),
    } as unknown as SupabaseClient;
    await expect(
      issueEmailOtp(admin, { tenantId: TENANT, userId: USER, email: EMAIL, purpose: PURPOSE }),
    ).rejects.toBeTruthy();
  });
});

describe("confirmEmailOtp()", () => {
  it("正しいコードで ok:true、used_at を update する", async () => {
    const issueStub = makeStub();
    const code = await issueEmailOtp(issueStub.admin, {
      tenantId: TENANT,
      userId: USER,
      email: EMAIL,
      purpose: PURPOSE,
    });
    const row = {
      id: "row-1",
      code_hash: issueStub.getInsertedPayload()!.code_hash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 0,
    };

    const confirmStub = makeStub({ row });
    const result = await confirmEmailOtp(confirmStub.admin, {
      tenantId: TENANT,
      userId: USER,
      purpose: PURPOSE,
      code,
    });

    expect(result).toEqual({ ok: true });
    expect(confirmStub.updates).toHaveLength(1);
    expect(confirmStub.updates[0]).toHaveProperty("used_at");
  });

  it("該当コードが無ければ not_found", async () => {
    const stub = makeStub({ row: null });
    const result = await confirmEmailOtp(stub.admin, {
      tenantId: TENANT,
      userId: USER,
      purpose: PURPOSE,
      code: "000000",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("コードが違えば mismatch になり、attempts を進める", async () => {
    const issueStub = makeStub();
    await issueEmailOtp(issueStub.admin, { tenantId: TENANT, userId: USER, email: EMAIL, purpose: PURPOSE });
    const row = {
      id: "row-1",
      code_hash: issueStub.getInsertedPayload()!.code_hash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 0,
    };

    const confirmStub = makeStub({ row });
    const result = await confirmEmailOtp(confirmStub.admin, {
      tenantId: TENANT,
      userId: USER,
      purpose: PURPOSE,
      code: "000000", // issue されたコードとは違う値
    });

    expect(result).toEqual({ ok: false, reason: "mismatch" });
    expect(confirmStub.updates).toHaveLength(1);
    expect(confirmStub.updates[0]).toMatchObject({ attempts: 1 });
  });

  it("期限切れなら expired になり、attempts は進めない", async () => {
    const issueStub = makeStub();
    await issueEmailOtp(issueStub.admin, { tenantId: TENANT, userId: USER, email: EMAIL, purpose: PURPOSE });
    const row = {
      id: "row-1",
      code_hash: issueStub.getInsertedPayload()!.code_hash,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      attempts: 0,
    };

    const confirmStub = makeStub({ row });
    const result = await confirmEmailOtp(confirmStub.admin, {
      tenantId: TENANT,
      userId: USER,
      purpose: PURPOSE,
      code: "000000",
    });

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(confirmStub.updates).toHaveLength(0);
  });

  it("試行回数の上限に達したら max_attempts になる", async () => {
    const issueStub = makeStub();
    await issueEmailOtp(issueStub.admin, { tenantId: TENANT, userId: USER, email: EMAIL, purpose: PURPOSE });
    const row = {
      id: "row-1",
      code_hash: issueStub.getInsertedPayload()!.code_hash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      attempts: 3,
    };

    const confirmStub = makeStub({ row });
    const result = await confirmEmailOtp(confirmStub.admin, {
      tenantId: TENANT,
      userId: USER,
      purpose: PURPOSE,
      code: "000000",
    });

    expect(result).toEqual({ ok: false, reason: "max_attempts" });
  });
});
