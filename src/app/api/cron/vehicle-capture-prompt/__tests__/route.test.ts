/**
 * vehicle-capture-prompt cron の gating ロジックの単体テスト。
 *
 * 検証する契約:
 *   - LINE 会話フロー経由で確定した予約 (元フローが closed で reservation_id 紐付け済み)
 *     のうち車両未登録のものだけ promptVehicleCaptureIfNeeded を呼ぶ
 *   - 手動作成 (LINE フローの紐付けが無い) 予約は呼ばない
 *   - 車両登録済み (vehicle_id が付いている) 予約は呼ばない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  promptVehicleCaptureIfNeeded: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/cronAuth", () => ({ verifyCronRequest: () => ({ authorized: true }) }));
vi.mock("@/lib/cron/lock", () => ({
  withCronLock: async (_a: unknown, _n: string, _t: number, fn: () => Promise<unknown>) => ({
    acquired: true,
    value: await fn(),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("@/lib/admin/fetchTodaySignals", () => ({ businessDateString: () => "2026-07-14" }));
vi.mock("@/lib/ai/automation/vehicleCaptureAuto", () => ({
  promptVehicleCaptureIfNeeded: mocks.promptVehicleCaptureIfNeeded,
  FLOW_PURPOSE_KEY: "purpose",
  FLOW_PURPOSE_VEHICLE_CAPTURE: "vehicle_capture",
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import { GET } from "../route";

const TENANT = "aaaaaaaa-0000-0000-0000-000000000000";
const TODAY = "2026-07-14";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({ tenants: [{ id: TENANT, is_active: true }] });
  mocks.promptVehicleCaptureIfNeeded.mockResolvedValue(true);
});

describe("GET /api/cron/vehicle-capture-prompt", () => {
  it("prompts only the reservation that closed a LINE quote flow (skips manual & already-registered)", async () => {
    mocks.store.tables.reservations = [
      {
        id: "res-line",
        tenant_id: TENANT,
        customer_id: "cust-1",
        scheduled_date: TODAY,
        status: "confirmed",
        vehicle_id: null,
      },
      {
        id: "res-manual",
        tenant_id: TENANT,
        customer_id: "cust-2",
        scheduled_date: TODAY,
        status: "confirmed",
        vehicle_id: null,
      },
    ];
    mocks.store.tables.line_conversation_flows = [
      // 元の商談フロー: LINE 経由で確定した予約に紐づく (purpose マーカー無し)。
      { id: "flow-origin", tenant_id: TENANT, reservation_id: "res-line", state: "closed", context_json: {} },
    ];

    const res = await GET(new NextRequest("https://app.example.com/api/cron/vehicle-capture-prompt"));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.prompted).toBe(1);
    expect(body.skipped).toBe(1); // res-manual (LINE フロー紐付け無し)
    expect(mocks.promptVehicleCaptureIfNeeded).toHaveBeenCalledTimes(1);
    expect(mocks.promptVehicleCaptureIfNeeded).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      expect.objectContaining({ id: "res-line" }),
      expect.arrayContaining([expect.objectContaining({ id: "flow-origin" })]),
    );
  });

  it("does not re-prompt when a vehicle-capture side-flow already exists for the reservation", async () => {
    mocks.store.tables.reservations = [
      {
        id: "res-line",
        tenant_id: TENANT,
        customer_id: "cust-1",
        scheduled_date: TODAY,
        status: "confirmed",
        vehicle_id: null,
      },
    ];
    mocks.store.tables.line_conversation_flows = [
      { id: "flow-origin", tenant_id: TENANT, reservation_id: "res-line", state: "closed", context_json: {} },
      {
        id: "flow-capture",
        tenant_id: TENANT,
        reservation_id: "res-line",
        state: "awaiting_vehicle_photo",
        context_json: { purpose: "vehicle_capture" },
      },
    ];
    mocks.promptVehicleCaptureIfNeeded.mockResolvedValue(false);

    const res = await GET(new NextRequest("https://app.example.com/api/cron/vehicle-capture-prompt"));
    const body = await res.json();

    // fromLineFlow の判定自体は満たすため呼ばれるが、内部の重複チェックで false が返る
    // (promptVehicleCaptureIfNeeded 自体は vehicleCaptureAuto.test.ts で検証済み)。
    expect(mocks.promptVehicleCaptureIfNeeded).toHaveBeenCalledTimes(1);
    expect(body.prompted).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("does not misclassify a manually-created reservation that only has an unrelated closed side-flow (future purpose marker)", async () => {
    mocks.store.tables.reservations = [
      {
        id: "res-manual-with-other-flow",
        tenant_id: TENANT,
        customer_id: "cust-1",
        scheduled_date: TODAY,
        status: "confirmed",
        vehicle_id: null,
      },
    ];
    mocks.store.tables.line_conversation_flows = [
      // 将来 Phase4/5 が追加しうる、別 purpose を持つ側フロー。元の商談フローではない。
      {
        id: "flow-invoice-approval",
        tenant_id: TENANT,
        reservation_id: "res-manual-with-other-flow",
        state: "closed",
        context_json: { purpose: "invoice_approval" },
      },
    ];

    const res = await GET(new NextRequest("https://app.example.com/api/cron/vehicle-capture-prompt"));
    const body = await res.json();

    expect(mocks.promptVehicleCaptureIfNeeded).not.toHaveBeenCalled();
    expect(body.skipped).toBe(1);
  });

  it("skips a reservation that already has a vehicle registered", async () => {
    mocks.store.tables.reservations = [
      {
        id: "res-registered",
        tenant_id: TENANT,
        customer_id: "cust-1",
        scheduled_date: TODAY,
        status: "confirmed",
        vehicle_id: "veh-1",
      },
    ];

    const res = await GET(new NextRequest("https://app.example.com/api/cron/vehicle-capture-prompt"));
    const body = await res.json();

    expect(mocks.promptVehicleCaptureIfNeeded).not.toHaveBeenCalled();
    expect(body.prompted).toBe(0);
  });
});
