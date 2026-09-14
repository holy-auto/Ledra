import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoReplyRoughEstimate: vi.fn(),
  generateQuoteFromVehicle: vi.fn(),
  sendCustomerLineText: vi.fn(),
  sendCustomerLineButtons: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  usageRecord: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => makeFakeAdmin(mocks.store),
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({ shouldAutoReplyRoughEstimate: mocks.shouldAutoReplyRoughEstimate }));
vi.mock("@/lib/ai/quoteFromVehicle", () => ({
  generateQuoteFromVehicle: mocks.generateQuoteFromVehicle,
  extractInvoiceLines: () => ({ items: [], total: 0 }),
}));
vi.mock("@/lib/ai/client", () => ({ fastModelForPlanTier: () => "claude-haiku" }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: mocks.sendCustomerLineText,
  sendCustomerLineButtons: mocks.sendCustomerLineButtons,
}));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import {
  maybeAutoReplyRoughEstimate,
  roughEstimateRange,
  buildRoughEstimateMessage,
  buildMissingInfoMessage,
} from "../quoteReplyAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-4222-a222-222222222222";
const LINE_USER = "Uabc123";

function baseParams() {
  return {
    tenantId: TENANT,
    customerId: CUSTOMER,
    lineUserId: LINE_USER,
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
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.shouldAutoReplyRoughEstimate.mockReturnValue(true);
  mocks.generateQuoteFromVehicle.mockResolvedValue({
    items: [{ description: "ガラスコーティング (LL)", quantity: 1, unit_price: 100000 }],
    total: 100000,
    validity_days: 30,
    terms: null,
    ai: true,
    confidence: 0.8,
  });
  mocks.sendCustomerLineText.mockResolvedValue(true);
  mocks.sendCustomerLineButtons.mockResolvedValue(true);
});

describe("roughEstimateRange", () => {
  it("bands ±15% around the tax-included total, rounded to ¥1,000", () => {
    // 110,000 込 → [93,500→93,000, 126,500→127,000]
    expect(roughEstimateRange(110000)).toEqual({ low: 93000, high: 127000 });
  });
  it("never returns a negative low bound", () => {
    expect(roughEstimateRange(0).low).toBe(0);
  });
});

describe("buildRoughEstimateMessage", () => {
  it("shows a range and a store-visit note when an amount exists", () => {
    const body = buildRoughEstimateMessage({
      service: "コーティング",
      vehicleText: "ヴェルファイア",
      totalInclTax: 110000,
    });
    expect(body).toContain("概算金額");
    expect(body).toContain("〜");
    expect(body).toContain("ご来店時");
  });
  it("omits the amount and guides to the store when no basis exists", () => {
    const body = buildRoughEstimateMessage({ service: "コーティング", vehicleText: "不明車", totalInclTax: 0 });
    expect(body).not.toContain("概算金額");
    expect(body).toContain("ご来店時");
  });
  it("aligns the closing to LINE continuation when canContinueOnLine is set", () => {
    const body = buildRoughEstimateMessage({
      service: "コーティング",
      vehicleText: "ヴェルファイア",
      totalInclTax: 110000,
      canContinueOnLine: true,
    });
    // 「来店のみ」の締めを出さず、LINE で正式見積りへ続けられる旨に揃える。
    expect(body).toContain("LINEで承ります");
    expect(body).not.toContain("正式・詳細なお見積りはご来店時に承ります");
  });
  it("drops the visit-only line in the no-amount branch when continuing on LINE (no contradiction)", () => {
    const body = buildRoughEstimateMessage({
      service: "コーティング",
      vehicleText: "不明車",
      totalInclTax: 0,
      canContinueOnLine: true,
    });
    // 金額なし＋ボタン継続時は「お車を拝見して＝来店前提」の一文を出さない（closing と矛盾するため）。
    expect(body).not.toContain("お車を拝見して");
    expect(body).toContain("LINEで承ります");
  });
});

describe("buildMissingInfoMessage", () => {
  it("asks only for what is missing", () => {
    expect(buildMissingInfoMessage({ hasService: true, hasVehicle: false })).toContain("お車の情報");
    expect(buildMissingInfoMessage({ hasService: false, hasVehicle: true })).toContain("ご希望の施工内容");
  });
});

describe("maybeAutoReplyRoughEstimate", () => {
  it("sends a rough estimate range to a known customer and audits it", async () => {
    await maybeAutoReplyRoughEstimate(baseParams());

    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const arg = mocks.sendCustomerLineText.mock.calls[0][0];
    expect(arg).toMatchObject({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: LINE_USER });
    // 100,000 税抜 → 110,000 税込 → ¥93,000〜¥127,000
    expect(arg.body).toContain("¥93,000〜¥127,000");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: "quote.auto_reply_rough_estimate" }),
    );
  });

  it("attaches follow-up buttons and LINE-aligned copy when attachButtons is set", async () => {
    await maybeAutoReplyRoughEstimate({ ...baseParams(), attachButtons: true });
    // ボタン付き送信を使い、素のテキスト送信は使わない。
    expect(mocks.sendCustomerLineButtons).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
    const arg = mocks.sendCustomerLineButtons.mock.calls[0][0];
    expect(arg.text).toContain("¥93,000〜¥127,000");
    expect(arg.text).toContain("LINEで承ります");
    // buildFollowupButtons: お見積り依頼 (flow:start_quote) と相談 (flow:consult)。
    expect(arg.buttons.map((b: { data: string }) => b.data)).toEqual(["flow:start_quote", "flow:consult"]);
  });

  it("uses plain text (no buttons) and store-visit copy when attachButtons is not set", async () => {
    await maybeAutoReplyRoughEstimate(baseParams());
    expect(mocks.sendCustomerLineButtons).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].body).toContain("ご来店時");
  });

  it("also replies to an unknown (unlinked) LINE user", async () => {
    await maybeAutoReplyRoughEstimate({ ...baseParams(), customerId: null });
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerLineText.mock.calls[0][0].customerId).toBeNull();
  });

  it("sends the store-visit message (no amount) when there is no pricing basis", async () => {
    mocks.generateQuoteFromVehicle.mockResolvedValue({
      items: [{ description: "コーティング 一式", quantity: 1, unit_price: 0 }],
      total: 0,
      validity_days: 30,
      terms: null,
      ai: false,
      confidence: 0.2,
    });
    await maybeAutoReplyRoughEstimate(baseParams());
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body;
    expect(body).not.toContain("概算金額");
    expect(body).toContain("ご来店時");
  });

  it("does nothing when opt-in is off", async () => {
    mocks.shouldAutoReplyRoughEstimate.mockReturnValue(false);
    await maybeAutoReplyRoughEstimate(baseParams());
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing without a LINE user id to reply to", async () => {
    await maybeAutoReplyRoughEstimate({ ...baseParams(), lineUserId: null });
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("does nothing when service or vehicle could not be extracted and the text has no price-inquiry keyword", async () => {
    await maybeAutoReplyRoughEstimate({ ...baseParams(), vehicleText: "", text: "定休日はいつですか？" });
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).not.toHaveBeenCalled();
  });

  it("asks for the missing vehicle info instead of skipping silently when the text looks like a price inquiry", async () => {
    await maybeAutoReplyRoughEstimate({
      ...baseParams(),
      vehicleText: "",
      text: "コーティングの見積りが欲しいです",
    });
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
    expect(mocks.sendCustomerLineText).toHaveBeenCalledTimes(1);
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body;
    expect(body).toContain("お車の情報");
    expect(body).not.toContain("ご希望の施工内容");
    expect(mocks.logAutoActionExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: "quote.auto_reply_rough_estimate",
        detail: expect.objectContaining({ missing_info: true }),
      }),
    );
  });

  it("asks for the missing service info when only the vehicle was extracted", async () => {
    await maybeAutoReplyRoughEstimate({
      ...baseParams(),
      service: "",
      text: "アルファードの見積りをお願いします",
    });
    const body = mocks.sendCustomerLineText.mock.calls[0][0].body;
    expect(body).toContain("ご希望の施工内容");
    expect(body).not.toContain("お車の情報");
  });

  it("does not audit-log a missing-info reply that failed to deliver", async () => {
    mocks.sendCustomerLineText.mockResolvedValue(false);
    await maybeAutoReplyRoughEstimate({
      ...baseParams(),
      vehicleText: "",
      text: "コーティングの見積りが欲しいです",
    });
    expect(mocks.logAutoActionExecuted).not.toHaveBeenCalled();
  });

  it("skips non-quote intents", async () => {
    await maybeAutoReplyRoughEstimate({ ...baseParams(), intent: "cancel" });
    expect(mocks.generateQuoteFromVehicle).not.toHaveBeenCalled();
  });

  it("passes matching menu_items as baseMenu when the category matches the requested service", async () => {
    mocks.store.tables.menu_items = [
      {
        tenant_id: TENANT,
        is_active: true,
        name: "ガラスコーティング",
        unit_price: 80000,
        category_large: "コーティング",
      },
      { tenant_id: TENANT, is_active: true, name: "洗車", unit_price: 3000, category_large: "洗車" },
    ];
    await maybeAutoReplyRoughEstimate(baseParams());
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toEqual([{ name: "ガラスコーティング", default_price: 80000, size_adjusted: false }]);
  });

  it("omits baseMenu when no registered menu item matches the requested service category", async () => {
    mocks.store.tables.menu_items = [
      { tenant_id: TENANT, is_active: true, name: "洗車", unit_price: 3000, category_large: "洗車" },
    ];
    await maybeAutoReplyRoughEstimate(baseParams());
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toBeUndefined();
  });

  it("does not use an unpriced (0円) matching menu item as baseMenu", async () => {
    mocks.store.tables.menu_items = [
      { tenant_id: TENANT, is_active: true, name: "ガラスコーティング", unit_price: 0, category_large: "コーティング" },
    ];
    await maybeAutoReplyRoughEstimate(baseParams());
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toBeUndefined();
  });

  it("omits baseMenu when only some of the comma-separated requested services have a matching menu item", async () => {
    mocks.store.tables.menu_items = [
      {
        tenant_id: TENANT,
        is_active: true,
        name: "ガラスコーティング",
        unit_price: 80000,
        category_large: "コーティング",
      },
      // "撥水" に一致する品目は無い
    ];
    await maybeAutoReplyRoughEstimate({ ...baseParams(), service: "コーティング, ホイール撥水" });
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toBeUndefined();
  });

  it("uses baseMenu when every comma-separated requested service has a matching menu item", async () => {
    mocks.store.tables.menu_items = [
      {
        tenant_id: TENANT,
        is_active: true,
        name: "ガラスコーティング",
        unit_price: 80000,
        category_large: "コーティング",
      },
      { tenant_id: TENANT, is_active: true, name: "ホイール撥水", unit_price: 5000, category_large: "撥水" },
    ];
    await maybeAutoReplyRoughEstimate({ ...baseParams(), service: "コーティング, 撥水" });
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toEqual([
      { name: "ガラスコーティング", default_price: 80000, size_adjusted: false },
      { name: "ホイール撥水", default_price: 5000, size_adjusted: false },
    ]);
  });

  it("車両サイズ別価格メニューは size_class に対応する価格を size_adjusted で採用する", async () => {
    // 登録車両 ヴェルファイア = size_class LL。
    mocks.store.tables.menu_items = [
      {
        tenant_id: TENANT,
        is_active: true,
        name: "ガラスコーティング",
        unit_price: 0,
        category_large: "コーティング",
        size_axis: "vehicle_size",
        size_prices: { M: 80000, LL: 120000 },
      },
    ];
    await maybeAutoReplyRoughEstimate(baseParams());
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toEqual([{ name: "ガラスコーティング", default_price: 120000, size_adjusted: true }]);
  });

  it("ホイールインチ別価格メニューは自動概算では対象外 (今フェーズ)", async () => {
    mocks.store.tables.menu_items = [
      {
        tenant_id: TENANT,
        is_active: true,
        name: "ホイールコーティング",
        unit_price: 0,
        category_large: "コーティング",
        size_axis: "wheel_size",
        size_prices: { "18": 7000, "20": 9000 },
      },
    ];
    await maybeAutoReplyRoughEstimate(baseParams());
    const arg = mocks.generateQuoteFromVehicle.mock.calls[0][0];
    expect(arg.baseMenu).toBeUndefined();
  });
});
