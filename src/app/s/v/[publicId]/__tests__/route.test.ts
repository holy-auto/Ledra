/**
 * /s/v/[publicId] タグ解決ルートの単体テスト。
 *
 * 検証する契約:
 *   - 未ログイン → /login?next=/s/v/<publicId> へリダイレクト
 *   - 自分の所属店舗に無い public_id → 404
 *   - 所属店舗の車両 → /admin/vehicles/<id>?start=1 へリダイレクト
 *   - vehicles クエリが「ユーザの全所属テナント (in) + public_id (eq)」で絞られる
 *     (テナント分離の要 + 複数店舗スタッフ対応)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => fromMock(...args),
      auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    }),
}));

import { GET } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "99999999-9999-9999-9999-999999999999";
const USER = "22222222-2222-2222-2222-222222222222";
const VEHICLE = "44444444-4444-4444-4444-444444444444";
const PUBLIC_ID = "veh_abc123";

let capturedVehicleIn: [string, unknown] | null;
let capturedVehicleEq: [string, unknown] | null;

function setup(opts: {
  user: { id: string } | null;
  membershipTenantIds: string[];
  vehicle: { id: string; tenant_id: string } | null;
}) {
  capturedVehicleIn = null;
  capturedVehicleEq = null;
  getUserMock.mockResolvedValue({ data: { user: opts.user } });
  fromMock.mockImplementation((table: string) => {
    if (table === "tenant_memberships") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: opts.membershipTenantIds.map((t) => ({ tenant_id: t })), error: null }),
        }),
      };
    }
    if (table === "vehicles") {
      return {
        select: () => ({
          in: (col: string, val: unknown) => {
            capturedVehicleIn = [col, val];
            return {
              eq: (col2: string, val2: unknown) => {
                capturedVehicleEq = [col2, val2];
                return { maybeSingle: () => Promise.resolve({ data: opts.vehicle, error: null }) };
              },
            };
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function req() {
  return new NextRequest(`https://app.example.com/s/v/${PUBLIC_ID}`);
}
const ctx = { params: Promise.resolve({ publicId: PUBLIC_ID }) };

describe("GET /s/v/[publicId]", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it("未ログインなら /login?next=/s/v/<publicId> へリダイレクト", async () => {
    setup({ user: null, membershipTenantIds: [], vehicle: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login?next=");
    expect(decodeURIComponent(loc)).toContain(`/s/v/${PUBLIC_ID}`);
  });

  it("所属店舗に無い車両は 404", async () => {
    setup({ user: { id: USER }, membershipTenantIds: [TENANT], vehicle: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("所属店舗の車両は詳細ページ (?start=1) へリダイレクトし、全所属テナント + public_id で絞る", async () => {
    setup({
      user: { id: USER },
      membershipTenantIds: [OTHER, TENANT],
      vehicle: { id: VEHICLE, tenant_id: TENANT },
    });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.example.com/admin/vehicles/${VEHICLE}?start=1`);
    // テナント分離: ユーザの全所属テナントに限定 + public_id で解決
    expect(capturedVehicleIn).toEqual(["tenant_id", [OTHER, TENANT]]);
    expect(capturedVehicleEq).toEqual(["public_id", PUBLIC_ID]);
  });
});
