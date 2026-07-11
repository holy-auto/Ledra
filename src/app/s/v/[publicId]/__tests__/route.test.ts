/**
 * /s/v/[publicId] タグ解決ルートの単体テスト。
 *
 * 検証する契約:
 *   - 未ログイン → /login?next=/s/v/<publicId> へリダイレクト
 *   - 他テナントの車両 / 不明な public_id → 404
 *   - 自テナントの車両 → /admin/vehicles/<id>?start=1 へリダイレクト
 *   - vehicles クエリが tenant_id と public_id の両方で必ず絞り込まれる
 *     (テナント分離の要。ここが壊れると他店舗の車両を開けてしまう)
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
const USER = "22222222-2222-2222-2222-222222222222";
const VEHICLE = "44444444-4444-4444-4444-444444444444";
const PUBLIC_ID = "veh_abc123";

/** 記録した vehicles クエリの eq フィルタ ([col, val] の配列)。 */
let capturedVehicleEq: Array<[string, unknown]>;

function setup(opts: {
  user: { id: string } | null;
  membership: { tenant_id: string } | null;
  vehicle: { id: string } | null;
}) {
  capturedVehicleEq = [];
  getUserMock.mockResolvedValue({ data: { user: opts.user } });
  fromMock.mockImplementation((table: string) => {
    if (table === "tenant_memberships") {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              single: () => Promise.resolve({ data: opts.membership, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "vehicles") {
      const eq = (col: string, val: unknown) => {
        capturedVehicleEq.push([col, val]);
        return {
          eq,
          maybeSingle: () => Promise.resolve({ data: opts.vehicle, error: null }),
        };
      };
      return { select: () => ({ eq }) };
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
    setup({ user: null, membership: null, vehicle: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login?next=");
    expect(decodeURIComponent(loc)).toContain(`/s/v/${PUBLIC_ID}`);
  });

  it("他テナントの車両 (解決不能) は 404", async () => {
    setup({ user: { id: USER }, membership: { tenant_id: TENANT }, vehicle: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
  });

  it("自テナントの車両は詳細ページ (?start=1) へリダイレクトし、tenant_id と public_id で絞り込む", async () => {
    setup({ user: { id: USER }, membership: { tenant_id: TENANT }, vehicle: { id: VEHICLE } });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.example.com/admin/vehicles/${VEHICLE}?start=1`);
    // テナント分離: 両フィルタが必ず適用されていること
    expect(capturedVehicleEq).toContainEqual(["tenant_id", TENANT]);
    expect(capturedVehicleEq).toContainEqual(["public_id", PUBLIC_ID]);
  });
});
