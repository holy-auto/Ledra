/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoDraftQuoteFromInbound: vi.fn(),
  generateQuoteFromVehicle: vi.fn(),
  insertDocWithRetry: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => makeFakeAdmin(mocks.store),
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({ shouldAutoDraftQuoteFromInbound: mocks.shouldAutoDraftQuoteFromInbound }));
vi.mock("@/lib/ai/quoteFromVehicle", () => ({ generateQuoteFromVehicle: mocks.generateQuoteFromVehicle }));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "claude-haiku" }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/invoice/invoiceNumber", () => ({ insertDocWithRetry: mocks.insertDocWithRetry }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeAutoDraftQuoteFromInbound } from "../quoteDraftAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";

function baseParams() {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    intent: "inquiry_only",
    service: "コーティング",
    vehicleText: "ヴェルファイア",
    messageId: "msg-1",
    channel: "line",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true }],
    customers: [{ id: CUSTOMER, tenant_id: TENANT, name: "堀越友輔" }],
    vehicles: [
      {
        tenant_id: TENANT,
        customer_id: CUSTOMER,
        maker: "トヨタ",
        model: "ヴェルファイア",
        size_class: "LL",
        plate_display: null,
      },
    ],
    invoices: [],
    documents: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.shouldAutoDraftQuoteFromInbound.mockReturnValue(true);
  mocks.generateQuoteFromVehicle.mockResolvedValue({
    items: [
      { description: "ガラスコーティング (LLサイズ)", quantity: 1, unit_price: 100000 },
      { description: "下地処理", quantity: 1, unit_price: 20000 },
    ],
    total: 120000,
    validity_days: 30,
    terms: null,
    ai: true,
    confidence: 0.8,
  });
  // insertDocWithRetry: 採番して insert コールバックを 1 回呼ぶ実装のふり
  mocks.insertDocWithRetry.mockImplementation(async (_a: any, _t: any, _d: any, _p: any, insert: any) =>
    insert("EST-202607-001"),
  );
});

describe("maybeAutoDraftQuoteFromInbound", () => {
  it("creates an estimate draft with computed totals and notifies staff", async () => {
    await maybeAutoDraftQuoteFromInbound(baseParams());

    const doc = mocks.store.inserts.find((i) => i.table === "documents")?.payload;
    expect(doc).toMatchObject({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      doc_type: "estimate",
      doc_number: "EST-202607-001",
      status: "draft",
      subtotal: 120000,
      tax: 12000,
      total: 132000,
    });
    expect(doc.meta_json).toMatchObject({ ai_inbound_draft: true, source_message_id: "msg-1" });
    // 登録車両 (LL) にマッチした情報が AI へ渡っている
    expect(mocks.generateQuoteFromVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ vehicle: expect.objectContaining({ size_class: "LL" }) }),
      expect.anything(),
    );
    expect(mocks.store.inserts.some((i) => i.table === "notifications")).toBe(true);
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "quote.auto_draft_from_inbound" }),
    );
  });

  it("does nothing for unknown customers", async () => {
    await maybeAutoDraftQuoteFromInbound({ ...baseParams(), customerId: null });
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
    expect(mocks.store.inserts).toHaveLength(0);
  });

  it("does nothing when service or vehicle could not be extracted", async () => {
    await maybeAutoDraftQuoteFromInbound({ ...baseParams(), vehicleText: "" });
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
  });

  it("skips when opt-in is off", async () => {
    mocks.shouldAutoDraftQuoteFromInbound.mockReturnValue(false);
    await maybeAutoDraftQuoteFromInbound(baseParams());
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
  });

  it("skips duplicate drafts within the dedup window", async () => {
    mocks.store.tables.documents.push({
      tenant_id: TENANT,
      customer_id: CUSTOMER,
      doc_type: "estimate",
      status: "draft",
      created_at: new Date().toISOString(),
      meta_json: { ai_inbound_draft: true },
    });
    await maybeAutoDraftQuoteFromInbound(baseParams());
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
    expect(mocks.store.inserts).toHaveLength(0);
  });
});
