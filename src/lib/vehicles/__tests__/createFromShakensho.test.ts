import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  emitEntityWebhook: vi.fn(),
}));

vi.mock("@/lib/outbound-webhooks", () => ({ emitEntityWebhook: mocks.emitEntityWebhook }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { createVehicleFromShakensho } from "../createFromShakensho";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";

let store: FakeStore;

beforeEach(() => {
  vi.clearAllMocks();
  store = emptyStore({ vehicle_size_master: [] });
});

describe("createVehicleFromShakensho", () => {
  it("inserts a vehicle from OCR data, deriving size class from dimensions, and emits a webhook", async () => {
    const admin = makeFakeAdmin(store);
    const id = await createVehicleFromShakensho(admin, {
      tenantId: TENANT,
      customerId: CUSTOMER,
      data: {
        maker: "トヨタ",
        model: "アルファード",
        first_registration: "令和4年3月",
        vin: "MXPH15-0012345",
        length_mm: 4950,
        width_mm: 1850,
        height_mm: 1950,
        plate_display: "品川300あ12-34",
        expiry_date: "2027-03-01",
      },
    });

    expect(id).toBeTruthy();
    const inserted = store.inserts.find((i) => i.table === "vehicles");
    expect(inserted).toBeTruthy();
    expect(inserted!.payload).toMatchObject({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      maker: "トヨタ",
      model: "アルファード",
      vin_code: "MXPH15-0012345",
      plate_display: "品川300あ12-34",
      inspection_expiry_date: "2027-03-01",
    });
    expect(inserted!.payload.size_class).toBeTruthy();
    expect(mocks.emitEntityWebhook).toHaveBeenCalledWith(
      TENANT,
      "vehicle.created",
      id,
      expect.objectContaining({ maker: "トヨタ", model: "アルファード" }),
    );
  });

  it("falls back to vehicle_size_master lookup when dimensions are missing", async () => {
    store.tables.vehicle_size_master = [{ maker: "トヨタ", model: "不明", size_class: "L" }];
    const admin = makeFakeAdmin(store);
    const id = await createVehicleFromShakensho(admin, {
      tenantId: TENANT,
      customerId: CUSTOMER,
      data: { maker: "トヨタ" },
    });

    expect(id).toBeTruthy();
    const inserted = store.inserts.find((i) => i.table === "vehicles");
    expect(inserted!.payload).toMatchObject({ maker: "トヨタ", model: "不明", size_class: "L" });
  });

  it("returns null without inserting when the maker could not be read", async () => {
    const admin = makeFakeAdmin(store);
    const id = await createVehicleFromShakensho(admin, {
      tenantId: TENANT,
      customerId: CUSTOMER,
      data: {},
    });
    expect(id).toBeNull();
    expect(store.inserts).toHaveLength(0);
    expect(mocks.emitEntityWebhook).not.toHaveBeenCalled();
  });
});
