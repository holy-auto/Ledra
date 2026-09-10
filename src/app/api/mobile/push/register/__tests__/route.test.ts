/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * code-review 指摘の回帰確認 (2026-09-09): 共有端末で前のユーザーが
 * サインアウトしても（401経由のサインアウトは常に失敗するため）push_tokens
 * に前ユーザーの行が残り続け、UNIQUE(user_id, token) への upsert は新しい
 * ユーザー用の行を追加するだけだった。新規登録時に同じ物理トークンを持つ
 * 他ユーザーの行を service-role で reclaim（削除）してから upsert すること。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  reclaimDeleteCalls: [] as Array<{ token: unknown; excludedUserId: unknown }>,
  upsertCalls: [] as unknown[],
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => ({
      delete: () => ({
        eq: (_col: string, token: unknown) => ({
          neq: (_col2: string, userId: unknown) => {
            mocks.reclaimDeleteCalls.push({ token, excludedUserId: userId });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

const CALLER_USER_ID = "11111111-1111-1111-1111-111111111111";
const CALLER_TENANT_ID = "22222222-2222-2222-2222-222222222222";

function callerSupabase() {
  const b: any = {
    from: () => b,
    upsert: (row: unknown) => {
      mocks.upsertCalls.push(row);
      return b;
    },
    select: () => b,
    single: async () => ({
      data: { id: "row-1", user_id: CALLER_USER_ID, tenant_id: CALLER_TENANT_ID, token: "tok-1", platform: "ios" },
      error: null,
    }),
  };
  return b;
}

import { POST } from "../route";

function makeReq(body: unknown) {
  return new NextRequest("http://x/api/mobile/push/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
  mocks.reclaimDeleteCalls = [];
  mocks.upsertCalls = [];
});

describe("POST /api/mobile/push/register", () => {
  it("同じ物理トークンを持つ他ユーザーの行をservice-roleでreclaim（削除）してからupsertする", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      userId: CALLER_USER_ID,
      tenantId: CALLER_TENANT_ID,
      supabase: callerSupabase(),
    });

    const res: any = await POST(makeReq({ token: "tok-1", platform: "ios" }));
    expect(res.status).toBe(200);

    // reclaim: 同じ token・呼び出し元ではない user_id で削除している
    expect(mocks.reclaimDeleteCalls.length).toBe(1);
    expect(mocks.reclaimDeleteCalls[0].token).toBe("tok-1");
    expect(mocks.reclaimDeleteCalls[0].excludedUserId).toBe(CALLER_USER_ID);

    // upsert は reclaim の後に実行されている
    expect(mocks.upsertCalls.length).toBe(1);
  });

  it("401 when unauthenticated", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce(null);
    const res: any = await POST(makeReq({ token: "tok-1", platform: "ios" }));
    expect(res.status).toBe(401);
    expect(mocks.reclaimDeleteCalls.length).toBe(0);
  });
});
