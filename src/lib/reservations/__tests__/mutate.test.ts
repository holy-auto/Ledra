import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  syncDeleteEvent: vi.fn(),
  syncUpdateEvent: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/gcal/client", () => ({
  syncDeleteEvent: mocks.syncDeleteEvent,
  syncUpdateEvent: mocks.syncUpdateEvent,
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { cancelReservationById, rescheduleReservationById } from "../mutate";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const admin = () => makeFakeAdmin(mocks.store);

function seed(reservation: Record<string, unknown>) {
  mocks.store = emptyStore({ reservations: [reservation] });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncDeleteEvent.mockResolvedValue(undefined);
  mocks.syncUpdateEvent.mockResolvedValue(undefined);
  mocks.store = emptyStore({ reservations: [] });
});

describe("cancelReservationById", () => {
  it("cancels the reservation, records the reason, and deletes the gcal event", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: CUSTOMER, status: "confirmed", gcal_event_id: "g1" });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
    });

    expect(result).toEqual({ ok: true, alreadyFinal: false });
    const upd = mocks.store.updates.find((u) => u.table === "reservations");
    expect(upd?.payload.status).toBe("cancelled");
    expect(upd?.payload.cancel_reason).toBeTruthy();
    expect(mocks.syncDeleteEvent).toHaveBeenCalledWith(TENANT, "res-1", "g1");
  });

  it("refuses to cancel another customer's reservation (owner guard)", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: "someone-else", status: "confirmed", gcal_event_id: "g1" });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
    });

    expect(result).toEqual({ ok: false, reason: "wrong_customer" });
    expect(mocks.store.updates.find((u) => u.table === "reservations")).toBeUndefined();
    expect(mocks.syncDeleteEvent).not.toHaveBeenCalled();
  });

  it("is idempotent when the reservation is already cancelled/completed", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: CUSTOMER, status: "cancelled", gcal_event_id: "g1" });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
    });

    expect(result).toEqual({ ok: true, alreadyFinal: true });
    expect(mocks.store.updates.find((u) => u.table === "reservations")).toBeUndefined();
    expect(mocks.syncDeleteEvent).not.toHaveBeenCalled();
  });

  it("returns not_found when no matching reservation exists", async () => {
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "nope",
      customerId: CUSTOMER,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects with too_late when scheduled_date is on/before the cutoff (day-of / past)", async () => {
    seed({
      id: "res-1",
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      status: "confirmed",
      scheduled_date: "2026-08-27",
      gcal_event_id: "g1",
    });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      cutoffDate: "2026-08-27", // 当日 = 締め切り以下なので拒否
    });

    expect(result).toEqual({ ok: false, reason: "too_late" });
    expect(mocks.store.updates.find((u) => u.table === "reservations")).toBeUndefined();
    expect(mocks.syncDeleteEvent).not.toHaveBeenCalled();
  });

  it("allows cancel when scheduled_date is after the cutoff (until day before)", async () => {
    seed({
      id: "res-1",
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      status: "confirmed",
      scheduled_date: "2026-08-28",
      gcal_event_id: "g1",
    });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      cutoffDate: "2026-08-27",
    });

    expect(result).toEqual({ ok: true, alreadyFinal: false });
    expect(mocks.syncDeleteEvent).toHaveBeenCalledWith(TENANT, "res-1", "g1");
  });

  it("cancels without a gcal event (no calendar sync needed)", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: CUSTOMER, status: "confirmed", gcal_event_id: null });
    const result = await cancelReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
    });

    expect(result).toEqual({ ok: true, alreadyFinal: false });
    expect(mocks.syncDeleteEvent).not.toHaveBeenCalled();
  });
});

describe("rescheduleReservationById", () => {
  it("updates date/time, records updated_at, and updates the gcal event", async () => {
    seed({
      id: "res-1",
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      status: "confirmed",
      scheduled_date: "2026-09-01",
      title: "コーティング",
      gcal_event_id: "g1",
    });
    const result = await rescheduleReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      newDate: "2026-09-05",
      newStartTime: "14:00:00",
      newEndTime: "15:00:00",
    });

    expect(result).toEqual({ ok: true });
    const upd = mocks.store.updates.find((u) => u.table === "reservations");
    expect(upd?.payload.scheduled_date).toBe("2026-09-05");
    expect(upd?.payload.start_time).toBe("14:00:00");
    expect(upd?.payload.end_time).toBe("15:00:00");
    expect(mocks.syncUpdateEvent).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ id: "res-1", scheduled_date: "2026-09-05", gcal_event_id: "g1" }),
    );
  });

  it("refuses to reschedule another customer's reservation (owner guard)", async () => {
    seed({
      id: "res-1",
      tenant_id: TENANT,
      customer_id: "someone-else",
      status: "confirmed",
      scheduled_date: "2026-09-01",
    });
    const result = await rescheduleReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      newDate: "2026-09-05",
      newStartTime: "14:00:00",
      newEndTime: "15:00:00",
    });
    expect(result).toEqual({ ok: false, reason: "wrong_customer" });
    expect(mocks.store.updates.find((u) => u.table === "reservations")).toBeUndefined();
  });

  it("refuses to reschedule a cancelled/completed reservation (not_reschedulable)", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: CUSTOMER, status: "completed", scheduled_date: "2026-09-01" });
    const result = await rescheduleReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      newDate: "2026-09-05",
      newStartTime: "14:00:00",
      newEndTime: "15:00:00",
    });
    expect(result).toEqual({ ok: false, reason: "not_reschedulable" });
    expect(mocks.syncUpdateEvent).not.toHaveBeenCalled();
  });

  it("rejects with too_late when the current date is on/before the cutoff", async () => {
    seed({ id: "res-1", tenant_id: TENANT, customer_id: CUSTOMER, status: "confirmed", scheduled_date: "2026-08-27" });
    const result = await rescheduleReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "res-1",
      customerId: CUSTOMER,
      newDate: "2026-09-05",
      newStartTime: "14:00:00",
      newEndTime: "15:00:00",
      cutoffDate: "2026-08-27",
    });
    expect(result).toEqual({ ok: false, reason: "too_late" });
    expect(mocks.store.updates.find((u) => u.table === "reservations")).toBeUndefined();
  });

  it("returns not_found when no matching reservation exists", async () => {
    const result = await rescheduleReservationById(admin(), {
      tenantId: TENANT,
      reservationId: "nope",
      customerId: CUSTOMER,
      newDate: "2026-09-05",
      newStartTime: "14:00:00",
      newEndTime: "15:00:00",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
