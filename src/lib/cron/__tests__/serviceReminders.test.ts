/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { processServiceReminders } from "@/lib/cron/serviceReminders";

vi.mock("@/lib/follow-up/email", () => ({ sendServiceReminderEmail: vi.fn() }));
vi.mock("@/lib/line/client", () => ({ sendMaintenanceLineMessage: vi.fn() }));

import { sendServiceReminderEmail } from "@/lib/follow-up/email";
import { sendMaintenanceLineMessage } from "@/lib/line/client";

type StubReminder = {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_name: string;
  reminder_type: "mileage" | "interval_months" | "both";
  next_due_date: string | null;
  next_due_mileage: number | null;
  recommended_interval_km: number | null;
};
type StubCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  line_user_id: string | null;
  followup_opt_out: boolean | null;
};
/** recorded_at 降順で渡す (DB の order を模す。stub は再ソートしない)。 */
type StubMileageLog = { vehicle_id: string; mileage_km: number; recorded_at: string };

function makeStub(opts: {
  reminders: StubReminder[];
  customers?: StubCustomer[];
  mileageLogs?: StubMileageLog[];
  remindersError?: { message: string };
}) {
  const notifiedIds: string[] = [];
  const logs: Array<Record<string, unknown>> = [];

  // service_reminders は軸ごとに 2 本のクエリが走る。各 select() ごとに独立した
  // チェーン状態を持たせ、.in("reminder_type", …) と .lte の有無で期日/距離を判別する。
  function makeSelectChain() {
    const state: { types: string[] | null; isDateQuery: boolean } = { types: null, isDateQuery: false };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      or: () => chain,
      not: () => chain,
      in: (col: string, vals: string[]) => {
        if (col === "reminder_type") state.types = vals;
        return chain;
      },
      lte: () => {
        state.isDateQuery = true;
        return chain;
      },
      then: (resolve: (v: unknown) => void) => {
        if (opts.remindersError) return resolve({ data: null, error: opts.remindersError });
        let rows = opts.reminders;
        if (state.types) rows = rows.filter((r) => state.types!.includes(r.reminder_type));
        // 期日クエリ: next_due_date 算出済みのみ (テストデータは常に dateCeil 内)。
        // 距離クエリ: next_due_mileage 算出済みのみ。
        rows = rows.filter((r) => (state.isDateQuery ? r.next_due_date != null : r.next_due_mileage != null));
        return resolve({ data: rows, error: null });
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      if (table === "service_reminders") {
        return {
          select: () => makeSelectChain(),
          update: () => ({
            eq: (col: string, val: string) => ({
              eq: () => {
                if (col === "id") notifiedIds.push(val);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "customers") {
        return { select: () => ({ in: () => Promise.resolve({ data: opts.customers ?? [], error: null }) }) };
      }
      if (table === "vehicles") {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === "vehicle_mileage_logs") {
        return {
          select: () => ({
            eq: () => ({ in: () => ({ order: () => Promise.resolve({ data: opts.mileageLogs ?? [], error: null }) }) }),
          }),
        };
      }
      if (table === "notification_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            logs.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as unknown as Parameters<typeof processServiceReminders>[0], notifiedIds, logs };
}

const lineMock = vi.mocked(sendMaintenanceLineMessage);
const emailMock = vi.mocked(sendServiceReminderEmail);

const tenantId = "t1";
const today = new Date("2026-05-22T00:00:00Z");

/** 期間軸の提案 (interval_months, next_due_date 到達)。 */
const dateReminder = (over: Partial<StubReminder> = {}): StubReminder => ({
  id: "r1",
  customer_id: "c1",
  vehicle_id: null,
  service_name: "エンジンオイル交換",
  reminder_type: "interval_months",
  next_due_date: "2026-05-30",
  next_due_mileage: null,
  recommended_interval_km: null,
  ...over,
});

/** 距離軸の提案 (mileage)。既定: 推奨 10000km / 次回 40000km。 */
const mileageReminder = (over: Partial<StubReminder> = {}): StubReminder => ({
  id: "r1",
  customer_id: "c1",
  vehicle_id: "v1",
  service_name: "タイヤローテーション",
  reminder_type: "mileage",
  next_due_date: null,
  next_due_mileage: 40000,
  recommended_interval_km: 10000,
  ...over,
});

const log = (mileage_km: number, recorded_at = "2026-05-20"): StubMileageLog => ({
  vehicle_id: "v1",
  mileage_km,
  recorded_at,
});

describe("processServiceReminders", () => {
  beforeEach(() => {
    lineMock.mockReset();
    emailMock.mockReset();
    lineMock.mockResolvedValue(true);
    emailMock.mockResolvedValue(true);
  });

  it("sends via LINE when the date is due, marks notified, logs sent", async () => {
    const { client, notifiedIds, logs } = makeStub({
      reminders: [dateReminder()],
      customers: [{ id: "c1", name: "山田", email: "y@example.com", line_user_id: "U1", followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(lineMock).toHaveBeenCalledTimes(1);
    expect(emailMock).not.toHaveBeenCalled();
    expect(notifiedIds).toEqual(["r1"]);
    expect(logs[0]).toMatchObject({ type: "service_reminder", target_id: "r1", channel: "line", status: "sent" });
  });

  it("falls back to email when no line_user_id (date-based timing)", async () => {
    const { client, logs } = makeStub({
      reminders: [dateReminder()],
      customers: [{ id: "c1", name: "佐藤", email: "s@example.com", line_user_id: null, followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({ timing: "2026-05-30頃" }));
    expect(logs[0]).toMatchObject({ channel: "email", status: "sent" });
  });

  it("sends when mileage is within the scaled threshold", async () => {
    const { client, notifiedIds } = makeStub({
      reminders: [mileageReminder()], // 推奨 10000km → window 5000km, 次回 40000km
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [log(38000)], // 残り 2000km → 閾値内
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(lineMock).toHaveBeenCalledWith(
      expect.objectContaining({ lineMessage: expect.stringContaining("40,000km") }),
    );
    expect(notifiedIds).toEqual(["r1"]);
  });

  it("does NOT send when mileage is still far from the threshold", async () => {
    const { client, notifiedIds } = makeStub({
      reminders: [mileageReminder()], // window 5000km
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [log(30000)], // 残り 10000km → 閾値外
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(0);
    expect(notifiedIds).toEqual([]);
  });

  it("does NOT fire immediately for short (<=5000km) intervals just after recreation", async () => {
    // 推奨 5000km → window = min(5000, 2500) = 2500km。次回 40000km、前回施工 35000km。
    // 再起票直後 (current = 35000) は残り 5000km > 2500 なので通知しない。
    const { client, notifiedIds } = makeStub({
      reminders: [mileageReminder({ recommended_interval_km: 5000, next_due_mileage: 40000 })],
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [log(35000)],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);
    expect(sent).toBe(0);
    expect(notifiedIds).toEqual([]);
  });

  it("uses the latest recorded_at reading, not the maximum mileage_km", async () => {
    // 最新 (先頭) は 30000 (残り 10000km → 閾値外)。過去に 50000 の誤入力があっても
    // max を採らず最新値を使うので通知しない。
    const { client, notifiedIds } = makeStub({
      reminders: [mileageReminder()], // window 5000km
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [log(30000, "2026-05-20"), log(50000, "2026-01-01")], // 降順
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);
    expect(sent).toBe(0);
    expect(notifiedIds).toEqual([]);
  });

  it("does NOT send a mileage reminder when the vehicle has no mileage log", async () => {
    const { client, notifiedIds } = makeStub({
      reminders: [mileageReminder()],
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(0);
    expect(notifiedIds).toEqual([]);
  });

  it("skips opt-out customers and those without any channel", async () => {
    const { client, notifiedIds } = makeStub({
      reminders: [dateReminder({ id: "r1", customer_id: "c1" }), dateReminder({ id: "r2", customer_id: "c2" })],
      customers: [
        { id: "c1", name: "A", email: "a@example.com", line_user_id: "U1", followup_opt_out: true },
        { id: "c2", name: "B", email: null, line_user_id: null, followup_opt_out: false },
      ],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(0);
    expect(lineMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
    expect(notifiedIds).toEqual([]);
  });

  it("marks notified even when sending fails (no resend loop) and logs failed", async () => {
    lineMock.mockResolvedValueOnce(false);
    emailMock.mockResolvedValueOnce(false);
    const { client, notifiedIds, logs } = makeStub({
      reminders: [dateReminder()],
      customers: [{ id: "c1", name: "鈴木", email: "z@example.com", line_user_id: "U1", followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(0);
    expect(notifiedIds).toEqual(["r1"]);
    expect(logs[0]).toMatchObject({ status: "failed" });
  });

  it("notifies a 'both' reminder only once when both axes are due", async () => {
    const { client, notifiedIds, logs } = makeStub({
      reminders: [
        mileageReminder({
          id: "r1",
          reminder_type: "both",
          next_due_date: "2026-05-30",
          next_due_mileage: 40000,
          recommended_interval_km: 10000,
        }),
      ],
      customers: [{ id: "c1", name: "田中", email: "t@example.com", line_user_id: "U1", followup_opt_out: false }],
      mileageLogs: [log(38000)],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(lineMock).toHaveBeenCalledTimes(1);
    expect(notifiedIds).toEqual(["r1"]);
    expect(logs).toHaveLength(1);
  });

  it("returns 0 (and does not throw) when the select errors", async () => {
    const { client } = makeStub({ reminders: [], remindersError: { message: "boom" } });
    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);
    expect(sent).toBe(0);
  });
});
