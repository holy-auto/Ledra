import { describe, expect, it, vi, beforeEach } from "vitest";
import { processInspectionReminders } from "@/lib/cron/inspectionReminders";

vi.mock("@/lib/follow-up/email", () => ({
  sendInspectionReminder: vi.fn(),
}));

import { sendInspectionReminder } from "@/lib/follow-up/email";

type StubVehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  inspection_expiry_date: string;
  inspection_reminder_sent_at: string | null;
};

type StubCustomer = {
  id: string;
  name: string | null;
  email: string | null;
};

/**
 * Minimal fake supabase client modelling only the calls inspectionReminders
 * makes. Records writes for assertions.
 */
function makeStub(opts: { vehiclesForDate: StubVehicle[]; customers?: StubCustomer[] }) {
  const updatedVehicleIds: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];

  const client = {
    from(table: string) {
      if (table === "vehicles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.vehiclesForDate, error: null }),
            }),
          }),
          update: () => ({
            eq: (_: string, id: string) => {
              updatedVehicleIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "customers") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: opts.customers ?? [], error: null }),
          }),
        };
      }
      if (table === "notification_logs") {
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return {
    client: client as unknown as Parameters<typeof processInspectionReminders>[0],
    updatedVehicleIds,
    inserts,
  };
}

const sendInspectionReminderMock = vi.mocked(sendInspectionReminder);

describe("processInspectionReminders", () => {
  beforeEach(() => {
    sendInspectionReminderMock.mockReset();
    sendInspectionReminderMock.mockResolvedValue(true);
  });

  const tenantId = "tenant-1";
  const today = new Date("2026-05-22T00:00:00Z");

  it("returns 0 when inspection_pre_days is null", async () => {
    const { client } = makeStub({ vehiclesForDate: [] });
    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: null },
      "Test Shop",
      today,
    );
    expect(sent).toBe(0);
    expect(sendInspectionReminderMock).not.toHaveBeenCalled();
  });

  it("returns 0 when no vehicles match the target date", async () => {
    const { client } = makeStub({ vehiclesForDate: [] });
    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Test Shop",
      today,
    );
    expect(sent).toBe(0);
  });

  it("sends to vehicles with denormalized customer_email", async () => {
    const { client, updatedVehicleIds, inserts } = makeStub({
      vehiclesForDate: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Aqua",
          year: 2022,
          customer_id: "c1",
          customer_name: "山田 太郎",
          customer_email: "yamada@example.com",
          inspection_expiry_date: "2026-07-21",
          inspection_reminder_sent_at: null,
        },
      ],
    });

    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Test Shop",
      today,
    );

    expect(sent).toBe(1);
    expect(sendInspectionReminderMock).toHaveBeenCalledTimes(1);
    expect(sendInspectionReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopName: "Test Shop",
        customerEmail: "yamada@example.com",
        customerName: "山田 太郎",
        vehicleLabel: "Toyota Aqua 2022",
        expiryDate: "2026-07-21",
        daysUntil: 60,
      }),
    );
    expect(updatedVehicleIds).toEqual(["v1"]);
    expect(inserts[0]).toMatchObject({
      tenant_id: tenantId,
      type: "inspection_reminder",
      target_type: "vehicle",
      target_id: "v1",
      status: "sent",
    });
  });

  it("falls back to customers table when vehicle has no denormalized email", async () => {
    const { client } = makeStub({
      vehiclesForDate: [
        {
          id: "v1",
          maker: "Honda",
          model: "Fit",
          year: 2023,
          customer_id: "c1",
          customer_name: null,
          customer_email: null,
          inspection_expiry_date: "2026-07-21",
          inspection_reminder_sent_at: null,
        },
      ],
      customers: [{ id: "c1", name: "佐藤 花子", email: "sato@example.com" }],
    });

    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Shop",
      today,
    );

    expect(sent).toBe(1);
    expect(sendInspectionReminderMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerEmail: "sato@example.com", customerName: "佐藤 花子" }),
    );
  });

  it("skips vehicles with no resolvable email", async () => {
    const { client, inserts } = makeStub({
      vehiclesForDate: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Prius",
          year: 2020,
          customer_id: null,
          customer_name: null,
          customer_email: null,
          inspection_expiry_date: "2026-07-21",
          inspection_reminder_sent_at: null,
        },
      ],
    });

    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Shop",
      today,
    );

    expect(sent).toBe(0);
    expect(sendInspectionReminderMock).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("skips vehicles that already have inspection_reminder_sent_at set", async () => {
    const { client } = makeStub({
      vehiclesForDate: [
        {
          id: "v1",
          maker: "Toyota",
          model: "Aqua",
          year: 2022,
          customer_id: null,
          customer_name: "山田",
          customer_email: "yamada@example.com",
          inspection_expiry_date: "2026-07-21",
          inspection_reminder_sent_at: "2026-04-01T00:00:00Z",
        },
      ],
    });

    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Shop",
      today,
    );
    expect(sent).toBe(0);
    expect(sendInspectionReminderMock).not.toHaveBeenCalled();
  });

  it("records failed status when email send fails", async () => {
    sendInspectionReminderMock.mockResolvedValueOnce(false);
    const { client, updatedVehicleIds, inserts } = makeStub({
      vehiclesForDate: [
        {
          id: "v1",
          maker: "Mazda",
          model: "CX-5",
          year: 2024,
          customer_id: null,
          customer_name: "鈴木",
          customer_email: "suzuki@example.com",
          inspection_expiry_date: "2026-07-21",
          inspection_reminder_sent_at: null,
        },
      ],
    });

    const sent = await processInspectionReminders(
      client,
      { tenant_id: tenantId, inspection_pre_days: 60 },
      "Shop",
      today,
    );

    expect(sent).toBe(0); // not counted as success
    expect(updatedVehicleIds).toEqual(["v1"]); // sent_at still updated to prevent re-send loop
    expect(inserts[0]).toMatchObject({ status: "failed" });
  });
});
