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
  next_due_date: string;
};
type StubCustomer = {
  id: string;
  name: string | null;
  email: string | null;
  line_user_id: string | null;
  followup_opt_out: boolean | null;
};

function makeStub(opts: {
  reminders: StubReminder[];
  customers?: StubCustomer[];
  remindersError?: { message: string };
}) {
  const notifiedIds: string[] = [];
  const logs: Array<Record<string, unknown>> = [];

  // service_reminders の select チェーンは長い (.eq.eq.in.not.lte.is)。
  // すべて自分自身を返し、await で結果を解決する thenable にする。
  const selectChain: any = {
    select: () => selectChain,
    eq: () => selectChain,
    in: () => selectChain,
    not: () => selectChain,
    lte: () => selectChain,
    is: () => selectChain,
    then: (resolve: (v: unknown) => void) =>
      resolve(opts.remindersError ? { data: null, error: opts.remindersError } : { data: opts.reminders, error: null }),
  };

  const client = {
    from(table: string) {
      if (table === "service_reminders") {
        return {
          select: () => selectChain,
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
const reminder = (over: Partial<StubReminder> = {}): StubReminder => ({
  id: "r1",
  customer_id: "c1",
  vehicle_id: null,
  service_name: "エンジンオイル交換",
  next_due_date: "2026-05-30",
  ...over,
});

describe("processServiceReminders", () => {
  beforeEach(() => {
    lineMock.mockReset();
    emailMock.mockReset();
    lineMock.mockResolvedValue(true);
    emailMock.mockResolvedValue(true);
  });

  it("sends via LINE when the customer has a line_user_id, marks notified, logs sent", async () => {
    const { client, notifiedIds, logs } = makeStub({
      reminders: [reminder()],
      customers: [{ id: "c1", name: "山田", email: "y@example.com", line_user_id: "U1", followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(lineMock).toHaveBeenCalledTimes(1);
    expect(emailMock).not.toHaveBeenCalled();
    expect(notifiedIds).toEqual(["r1"]);
    expect(logs[0]).toMatchObject({ type: "service_reminder", target_id: "r1", channel: "line", status: "sent" });
  });

  it("falls back to email when no line_user_id", async () => {
    const { client, logs } = makeStub({
      reminders: [reminder()],
      customers: [{ id: "c1", name: "佐藤", email: "s@example.com", line_user_id: null, followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(1);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(logs[0]).toMatchObject({ channel: "email", status: "sent" });
  });

  it("skips opt-out customers and those without any channel", async () => {
    const { client, notifiedIds } = makeStub({
      reminders: [reminder({ id: "r1", customer_id: "c1" }), reminder({ id: "r2", customer_id: "c2" })],
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
      reminders: [reminder()],
      customers: [{ id: "c1", name: "鈴木", email: "z@example.com", line_user_id: "U1", followup_opt_out: false }],
    });

    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);

    expect(sent).toBe(0);
    expect(notifiedIds).toEqual(["r1"]);
    expect(logs[0]).toMatchObject({ status: "failed" });
  });

  it("returns 0 (and does not throw) when the select errors", async () => {
    const { client } = makeStub({ reminders: [], remindersError: { message: "boom" } });
    const sent = await processServiceReminders(client, { tenant_id: tenantId }, "Shop", today);
    expect(sent).toBe(0);
  });
});
