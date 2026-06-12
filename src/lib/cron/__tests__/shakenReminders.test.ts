import { describe, expect, it, vi, beforeEach } from "vitest";
import { processShakenReminders } from "@/lib/cron/shakenReminders";

vi.mock("@/lib/line/client", () => ({
  sendMaintenanceLineMessage: vi.fn(),
}));

import { sendMaintenanceLineMessage } from "@/lib/line/client";

type StubVehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_id: string | null;
  inspection_expiry_date: string;
};

type StubCustomer = {
  id: string;
  name: string | null;
  line_user_id: string | null;
};

/**
 * processShakenReminders が触る最小限の supabase 呼び出しだけをモデル化する
 * フェイク client。書き込みは配列に記録してアサートする。
 *
 * 呼び出し順:
 *   1. vehicles  : select().eq().not().gte().lte()  → 対象車両
 *   2. customers : select().eq().in()               → 顧客 (line_user_id)
 *   3. notification_logs : select().eq().eq().in()  → 送信済みログ
 *   4. (loop) notification_logs.insert / vehicles.update
 */
function makeStub(opts: { vehicles: StubVehicle[]; customers?: StubCustomer[]; existingLogTargetIds?: string[] }) {
  const logInserts: Array<Record<string, unknown>> = [];
  const vehicleUpdates: string[] = [];

  const client = {
    from(table: string) {
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                gte: () => ({
                  lte: () => Promise.resolve({ data: opts.vehicles, error: null }),
                }),
              }),
            }),
          }),
          update: (_row: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              vehicleUpdates.push(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: opts.customers ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === "notification_logs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: (opts.existingLogTargetIds ?? []).map((id) => ({ target_id: id })),
                    error: null,
                  }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            logInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return {
    client: client as unknown as Parameters<typeof processShakenReminders>[0],
    logInserts,
    vehicleUpdates,
  };
}

const sendLineMock = vi.mocked(sendMaintenanceLineMessage);

describe("processShakenReminders", () => {
  beforeEach(() => {
    sendLineMock.mockReset();
    sendLineMock.mockResolvedValue(true);
  });

  const tenantId = "tenant-1";
  const today = new Date("2026-06-12T00:00:00Z");

  it("returns 0 when there are no vehicles in range", async () => {
    const { client } = makeStub({ vehicles: [] });
    const sent = await processShakenReminders(client, tenantId, "Test Shop", today);
    expect(sent).toBe(0);
    expect(sendLineMock).not.toHaveBeenCalled();
  });

  it("sends a LINE reminder to a vehicle whose customer has line_user_id", async () => {
    const { client, logInserts, vehicleUpdates } = makeStub({
      vehicles: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Aqua",
          year: 2022,
          plate_display: "品川330あ1234",
          customer_id: "c1",
          inspection_expiry_date: "2026-07-21", // 今日 +39 日 (範囲内)
        },
      ],
      customers: [{ id: "c1", name: "山田 太郎", line_user_id: "U-line-1" }],
    });

    const sent = await processShakenReminders(client, tenantId, "Test Shop", today);

    expect(sent).toBe(1);
    expect(sendLineMock).toHaveBeenCalledTimes(1);
    expect(sendLineMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId, lineUserId: "U-line-1" }));
    // メッセージ本文に満了日と残り日数が含まれる
    const arg = sendLineMock.mock.calls[0][0];
    expect(arg.lineMessage).toContain("2026-07-21");
    expect(arg.lineMessage).toContain("あと 39 日");
    expect(vehicleUpdates).toEqual(["v1"]);
    expect(logInserts[0]).toMatchObject({
      tenant_id: tenantId,
      type: "shaken_line_reminder",
      target_type: "vehicle",
      target_id: "v1",
      recipient_line_user_id: "U-line-1",
      status: "sent",
    });
  });

  it("skips vehicles whose customer has no line_user_id", async () => {
    const { client, logInserts } = makeStub({
      vehicles: [
        {
          id: "v1",
          maker: "Honda",
          model: "Fit",
          year: 2023,
          plate_display: null,
          customer_id: "c1",
          inspection_expiry_date: "2026-07-21",
        },
      ],
      customers: [{ id: "c1", name: "佐藤", line_user_id: null }],
    });

    const sent = await processShakenReminders(client, tenantId, "Shop", today);
    expect(sent).toBe(0);
    expect(sendLineMock).not.toHaveBeenCalled();
    expect(logInserts).toEqual([]);
  });

  it("skips vehicles with no customer_id", async () => {
    const { client } = makeStub({
      vehicles: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Prius",
          year: 2020,
          plate_display: null,
          customer_id: null,
          inspection_expiry_date: "2026-07-21",
        },
      ],
    });
    const sent = await processShakenReminders(client, tenantId, "Shop", today);
    expect(sent).toBe(0);
    expect(sendLineMock).not.toHaveBeenCalled();
  });

  it("skips vehicles already in notification_logs (dedupe)", async () => {
    const { client } = makeStub({
      vehicles: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Aqua",
          year: 2022,
          plate_display: "品川330あ1234",
          customer_id: "c1",
          inspection_expiry_date: "2026-07-21",
        },
      ],
      customers: [{ id: "c1", name: "山田", line_user_id: "U-line-1" }],
      existingLogTargetIds: ["v1"],
    });

    const sent = await processShakenReminders(client, tenantId, "Shop", today);
    expect(sent).toBe(0);
    expect(sendLineMock).not.toHaveBeenCalled();
  });

  it("records failed status and still updates sent_at when LINE send fails", async () => {
    sendLineMock.mockResolvedValueOnce(false);
    const { client, logInserts, vehicleUpdates } = makeStub({
      vehicles: [
        {
          id: "v1",
          maker: "Mazda",
          model: "CX-5",
          year: 2024,
          plate_display: "練馬500か5678",
          customer_id: "c1",
          inspection_expiry_date: "2026-07-21",
        },
      ],
      customers: [{ id: "c1", name: "鈴木", line_user_id: "U-line-1" }],
    });

    const sent = await processShakenReminders(client, tenantId, "Shop", today);
    expect(sent).toBe(0); // not counted as success
    expect(vehicleUpdates).toEqual(["v1"]); // sent_at still updated to prevent loop
    expect(logInserts[0]).toMatchObject({ status: "failed" });
  });
});
