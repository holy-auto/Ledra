import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoCaptureVehicleViaLine: vi.fn(),
  sendCustomerLineText: vi.fn(),
  recordInboundLineMessage: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  parseShakenshoAuto: vi.fn(),
  createVehicleFromShakensho: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => makeFakeAdmin(mocks.store) }));
vi.mock("../policy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: mocks.loadAiAutomationSettings };
});
vi.mock("../orchestrator", () => ({ shouldAutoCaptureVehicleViaLine: mocks.shouldAutoCaptureVehicleViaLine }));
vi.mock("@/lib/line/client", () => ({ sendCustomerLineText: mocks.sendCustomerLineText }));
vi.mock("@/lib/line/messageStore", () => ({ recordInboundLineMessage: mocks.recordInboundLineMessage }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/ocr/shakensho", () => ({ parseShakenshoAuto: mocks.parseShakenshoAuto }));
vi.mock("@/lib/vehicles/createFromShakensho", () => ({ createVehicleFromShakensho: mocks.createVehicleFromShakensho }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { promptVehicleCaptureIfNeeded, handleVehiclePhotoMessage } from "../vehicleCaptureAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";
const RESERVATION = "res-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true }],
    customers: [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: LINE_USER }],
    line_conversation_flows: [],
    reservations: [{ id: RESERVATION, tenant_id: TENANT, customer_id: CUSTOMER, vehicle_id: null }],
    notifications: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({
    enabled: true,
    sourcePolicies: { identity_documents: true },
  });
  mocks.shouldAutoCaptureVehicleViaLine.mockReturnValue(true);
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.recordInboundLineMessage.mockResolvedValue({ customerId: CUSTOMER });
});

describe("promptVehicleCaptureIfNeeded", () => {
  function reservation() {
    return { id: RESERVATION, customer_id: CUSTOMER };
  }

  it("creates an awaiting_vehicle_photo flow and asks for the shakensho photo", async () => {
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, reservation());
    expect(handled).toBe(true);

    const inserted = mocks.store.inserts.find((i) => i.table === "line_conversation_flows");
    expect(inserted).toBeTruthy();
    expect(inserted!.payload).toMatchObject({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      state: "awaiting_vehicle_photo",
      reservation_id: RESERVATION,
    });
    expect(inserted!.payload.context_json).toMatchObject({ purpose: "vehicle_capture" });

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("車検証");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "vehicle.auto_capture_via_line" }),
    );
  });

  it("does nothing when opt-in is off", async () => {
    mocks.shouldAutoCaptureVehicleViaLine.mockReturnValue(false);
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, reservation());
    expect(handled).toBe(false);
    expect(mocks.store.inserts).toHaveLength(0);
  });

  it("does nothing without a customer id", async () => {
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, {
      id: RESERVATION,
      customer_id: null,
    });
    expect(handled).toBe(false);
    expect(mocks.store.inserts).toHaveLength(0);
  });

  it("does not re-prompt when a capture flow already exists for this reservation", async () => {
    mocks.store.tables.line_conversation_flows = [
      {
        id: "flow-existing",
        tenant_id: TENANT,
        reservation_id: RESERVATION,
        context_json: { purpose: "vehicle_capture" },
      },
    ];
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, reservation());
    expect(handled).toBe(false);
    expect(mocks.store.inserts).toHaveLength(0);
  });

  it("does nothing when the customer has no LINE user id", async () => {
    mocks.store.tables.customers = [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: null }];
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, reservation());
    expect(handled).toBe(false);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("returns false and does not audit-log when delivery fails", async () => {
    mocks.sendCustomerLineText.mockResolvedValue(false);
    const handled = await promptVehicleCaptureIfNeeded(makeFakeAdmin(mocks.store), TENANT, reservation());
    expect(handled).toBe(false);
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });
});

describe("handleVehiclePhotoMessage", () => {
  function activeFlow(overrides: Record<string, unknown> = {}) {
    return {
      id: "flow-1",
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      line_user_id: LINE_USER,
      state: "awaiting_vehicle_photo",
      context_json: { purpose: "vehicle_capture" },
      reservation_id: RESERVATION,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function baseParams() {
    return { tenantId: TENANT, lineUserId: LINE_USER, customerId: CUSTOMER, imageBuffer: Buffer.from("img") };
  }

  it("returns false when there is no active vehicle-photo flow", async () => {
    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(false);
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
  });

  it("only registers a vehicle once when the same flow is delivered twice (LINE redelivery race)", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.parseShakenshoAuto.mockResolvedValue({ data: { maker: "トヨタ", model: "アルファード" }, source: "ocr" });
    mocks.createVehicleFromShakensho.mockResolvedValue("vehicle-1");

    const [first, second] = await Promise.all([
      handleVehiclePhotoMessage(baseParams()),
      handleVehiclePhotoMessage(baseParams()),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(mocks.createVehicleFromShakensho).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
  });

  it("registers the vehicle, links the reservation, and closes the flow on success", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.parseShakenshoAuto.mockResolvedValue({ data: { maker: "トヨタ", model: "アルファード" }, source: "ocr" });
    mocks.createVehicleFromShakensho.mockResolvedValue("vehicle-1");

    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(true);

    expect(mocks.createVehicleFromShakensho).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: TENANT, customerId: CUSTOMER }),
    );

    const reservationUpdate = mocks.store.updates.find((u) => u.table === "reservations");
    expect(reservationUpdate?.payload).toMatchObject({ vehicle_id: "vehicle-1" });

    const flowUpdate = mocks.store.updates.filter((u) => u.table === "line_conversation_flows").pop();
    expect(flowUpdate?.payload).toMatchObject({ state: "closed" });

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("登録いたしました");
    expect(mocks.store.inserts.some((i) => i.table === "notifications")).toBe(true);
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: "vehicle.auto_capture_via_line",
        resource: { kind: "vehicle", id: "vehicle-1" },
      }),
    );
  });

  it("does not overwrite a vehicle_id a staff member already assigned to the reservation", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.store.tables.reservations = [
      { id: RESERVATION, tenant_id: TENANT, customer_id: CUSTOMER, vehicle_id: "staff-assigned-vehicle" },
    ];
    mocks.parseShakenshoAuto.mockResolvedValue({ data: { maker: "トヨタ", model: "アルファード" }, source: "ocr" });
    mocks.createVehicleFromShakensho.mockResolvedValue("vehicle-1");

    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(true);

    const reservation = mocks.store.tables.reservations.find((r) => r.id === RESERVATION);
    expect(reservation?.vehicle_id).toBe("staff-assigned-vehicle");
  });

  it("hands off to staff when the maker could not be read", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.parseShakenshoAuto.mockResolvedValue({ data: {}, source: "ocr" });

    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(true);
    expect(mocks.createVehicleFromShakensho).not.toHaveBeenCalled();

    const flowUpdate = mocks.store.updates.filter((u) => u.table === "line_conversation_flows").pop();
    expect(flowUpdate?.payload).toMatchObject({ state: "human_takeover" });
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("読み取れません");
  });

  it("hands off to staff when vehicle registration fails", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.parseShakenshoAuto.mockResolvedValue({ data: { maker: "トヨタ" }, source: "ocr" });
    mocks.createVehicleFromShakensho.mockResolvedValue(null);

    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(true);
    const flowUpdate = mocks.store.updates.filter((u) => u.table === "line_conversation_flows").pop();
    expect(flowUpdate?.payload).toMatchObject({ state: "human_takeover" });
  });

  it("hands off to staff without calling OCR when the identity-document source is disabled", async () => {
    mocks.store.tables.line_conversation_flows = [activeFlow()];
    mocks.loadAiAutomationSettings.mockResolvedValue({
      enabled: true,
      sourcePolicies: { identity_documents: false },
    });

    const handled = await handleVehiclePhotoMessage(baseParams());
    expect(handled).toBe(true);
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
    const flowUpdate = mocks.store.updates.filter((u) => u.table === "line_conversation_flows").pop();
    expect(flowUpdate?.payload).toMatchObject({ state: "human_takeover" });
  });
});
