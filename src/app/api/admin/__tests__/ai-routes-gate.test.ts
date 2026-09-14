/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI 新エンドポイント群の共通 gate (auth / plan / rate limit / AI 設定 OFF) を検証する。
 *
 * ルートごとに細かい AI 出力を確認するのではなく、横断的に効く 4 つの早期 return:
 *   1) 認証なし → 401
 *   2) プラン不足 → 403 plan_limit
 *   3) rate limit 超過 → 429 (limiter から早期 return)
 *   4) tenant 設定で AI 無効 → 200 ai_disabled: true
 *
 * これら全 routes に同じパターンの early-return を入れたので、1 ファイルで
 * 16 route × 4 ケース ぶん網羅できる構造にしている。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  resolveInsurer: vi.fn(),
  loadSettings: vi.fn(),
  checkRateLimit: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  generateCertificateDraft: vi.fn(),
  generateJobAutoTitle: vi.fn(),
  generateJobNextAction: vi.fn(),
  generateTimerAlert: vi.fn(),
  generateInvoiceFromJob: vi.fn(),
  generateQuoteFromVehicle: vi.fn(),
  categorizeAccountingLines: vi.fn(),
  classifyInquiry: vi.fn(),
  extractInboundReservation: vi.fn(),
  analyzeReviewSentiment: vi.fn(),
  fuzzyMatchCustomer: vi.fn(),
  detectThicknessAnomaly: vi.fn(),
  suggestPosDeductions: vi.fn(),
  estimateMenuPrice: vi.fn(),
  generateMarketVehicleDescription: vi.fn(),
  translateText: vi.fn(),
  summarizeCase: vi.fn(),
  suggestCaseAssignees: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: makeAdminMock(), tenantId: "tenant-1" }),
  createInsurerScopedAdmin: () => ({ admin: makeAdminMock(), insurerId: "insurer-1" }),
}));
vi.mock("@/lib/auth/checkRole", () => ({
  resolveCallerWithRole: mocks.resolveCaller,
  requireMinRole: (caller: any, min: string) => ["admin", "owner"].includes(caller?.role) || min === "member",
}));
vi.mock("@/lib/api/insurerAuth", () => ({
  resolveInsurerCaller: mocks.resolveInsurer,
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/ai/automation/policy", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, loadAiAutomationSettings: mocks.loadSettings };
});

vi.mock("@/lib/ai/draftCertificate", () => ({ generateCertificateDraft: mocks.generateCertificateDraft }));
vi.mock("@/lib/ai/jobAutoTitle", () => ({
  generateJobAutoTitle: mocks.generateJobAutoTitle,
  clipTitle: (s: string) => s,
}));
vi.mock("@/lib/ai/jobNextAction", () => ({ generateJobNextAction: mocks.generateJobNextAction }));
vi.mock("@/lib/ai/jobTimerAlert", () => ({ generateTimerAlert: mocks.generateTimerAlert }));
vi.mock("@/lib/ai/invoiceFromJob", () => ({ generateInvoiceFromJob: mocks.generateInvoiceFromJob }));
vi.mock("@/lib/ai/quoteFromVehicle", () => ({ generateQuoteFromVehicle: mocks.generateQuoteFromVehicle }));
vi.mock("@/lib/ai/accountingCategoryEstimate", () => ({
  categorizeAccountingLines: mocks.categorizeAccountingLines,
}));
vi.mock("@/lib/ai/inquiryClassify", () => ({ classifyInquiry: mocks.classifyInquiry }));
vi.mock("@/lib/ai/inboundReservationExtract", () => ({
  extractInboundReservation: mocks.extractInboundReservation,
}));
vi.mock("@/lib/ai/reviewSentiment", () => ({ analyzeReviewSentiment: mocks.analyzeReviewSentiment }));
vi.mock("@/lib/ai/customerFuzzyMatch", () => ({ fuzzyMatchCustomer: mocks.fuzzyMatchCustomer }));
vi.mock("@/lib/ai/thicknessAnomaly", () => ({ detectThicknessAnomaly: mocks.detectThicknessAnomaly }));
vi.mock("@/lib/ai/posInventoryDeduction", () => ({ suggestPosDeductions: mocks.suggestPosDeductions }));
vi.mock("@/lib/ai/menuPriceEstimate", () => ({ estimateMenuPrice: mocks.estimateMenuPrice }));
vi.mock("@/lib/ai/marketVehicleDescription", () => ({
  generateMarketVehicleDescription: mocks.generateMarketVehicleDescription,
}));
vi.mock("@/lib/ai/translateContent", () => ({
  translateText: mocks.translateText,
  translationCacheKey: () => "cache-key",
  SUPPORTED_LANGUAGES: [],
}));
vi.mock("@/lib/ai/caseSummary", () => ({
  summarizeCase: mocks.summarizeCase,
  buildFallbackLines: () => ({ lines: ["", "", ""], confidence: 0, ai: false }),
}));
vi.mock("@/lib/ai/caseAssignSuggest", () => ({ suggestCaseAssignees: mocks.suggestCaseAssignees }));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

function makeAdminMock() {
  const builder: any = {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    upsert: async () => ({ error: null }),
    update: () => builder,
    insert: () => builder,
  };
  // promise-returnable when awaited mid-chain (e.g. from select.eq.eq)
  return new Proxy(builder, {
    get(t, p) {
      if (p === "then") return undefined;
      return t[p as string];
    },
  });
}

import { POST as JOB_AI_SUGGEST } from "@/app/api/admin/jobs/[id]/ai-suggest/route";
import { POST as INVOICE_AI } from "@/app/api/admin/invoices/ai-from-job/route";
import { POST as QUOTE_AI } from "@/app/api/admin/quotes/ai-from-vehicle/route";
import { POST as ACCOUNTING_AI } from "@/app/api/admin/accounting/ai-categorize/route";
import { POST as INQUIRY_AI } from "@/app/api/admin/customer-inquiries/[id]/ai-classify/route";
import { POST as INBOUND_AI } from "@/app/api/admin/reservations/ai-from-message/route";
import { POST as REVIEW_AI } from "@/app/api/admin/reviews/ai-sentiment/route";
import { POST as NORMALIZE_AI } from "@/app/api/admin/master-data/normalize/route";
import { POST as TRANSLATE_AI } from "@/app/api/admin/translate/route";
import { POST as MENU_PRICE_AI } from "@/app/api/admin/menu-items/[id]/ai-price/route";
import { POST as MARKET_AI } from "@/app/api/admin/market-vehicles/[id]/ai-description/route";
import { POST as INVENTORY_AI } from "@/app/api/admin/inventory/ai-pos-deduct/route";
import { POST as THICKNESS_AI } from "@/app/api/admin/thickness-reports/[reportId]/ai-anomaly/route";
import { POST as MSG_EXTRACT_AI } from "@/app/api/admin/customer-messages/[id]/ai-extract/route";
import { POST as CASE_SUMMARY_AI } from "@/app/api/insurer/cases/[id]/ai-summary/route";
import { POST as CASE_ASSIGN_AI } from "@/app/api/insurer/cases/[id]/ai-assign-suggest/route";

function req(body?: unknown): any {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
  mocks.createSupabaseServerClient.mockResolvedValue({});
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.loadSettings.mockResolvedValue({
    enabled: true,
    fieldPolicies: {},
    confidenceThreshold: 0.5,
    sourcePolicies: {},
    loadedFromDb: true,
  });
});

// ─────────────────────────────────────────────────────────────
// 1) 認証なし → 401
// ─────────────────────────────────────────────────────────────
describe("auth gate — unauthenticated caller returns 401", () => {
  beforeEach(() => {
    mocks.resolveCaller.mockResolvedValue(null);
    mocks.resolveInsurer.mockResolvedValue(null);
  });

  it("/admin/jobs/[id]/ai-suggest", async () => {
    const res = await JOB_AI_SUGGEST(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/invoices/ai-from-job", async () => {
    const res = await INVOICE_AI(req({ reservation_id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/quotes/ai-from-vehicle", async () => {
    const res = await QUOTE_AI(req({ vehicle_id: VALID_UUID, service_category: "コート" }));
    expect(res.status).toBe(401);
  });
  it("/admin/accounting/ai-categorize", async () => {
    const res = await ACCOUNTING_AI(
      req({
        fallback_code: "411",
        accounts: [{ code: "411", label: "売上" }],
        lines: [{ description: "x", amount: 1 }],
      }),
    );
    expect(res.status).toBe(401);
  });
  it("/admin/customer-inquiries/[id]/ai-classify", async () => {
    const res = await INQUIRY_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/reservations/ai-from-message", async () => {
    const res = await INBOUND_AI(req({ text: "予約お願いします" }));
    expect(res.status).toBe(401);
  });
  it("/admin/reviews/ai-sentiment", async () => {
    const res = await REVIEW_AI(req({ text: "良かった" }));
    expect(res.status).toBe(401);
  });
  it("/admin/master-data/normalize", async () => {
    const res = await NORMALIZE_AI(req({ maker: "TOYOTA" }));
    expect(res.status).toBe(401);
  });
  it("/admin/translate", async () => {
    const res = await TRANSLATE_AI(req({ text: "hello", target_lang: "en" }));
    expect(res.status).toBe(401);
  });
  it("/admin/menu-items/[id]/ai-price", async () => {
    const res = await MENU_PRICE_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/market-vehicles/[id]/ai-description", async () => {
    const res = await MARKET_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/inventory/ai-pos-deduct", async () => {
    const res = await INVENTORY_AI(
      req({
        sales: [{ menu_item_id: VALID_UUID, menu_item_name: "n", sold_quantity: 1 }],
      }),
    );
    expect(res.status).toBe(401);
  });
  it("/admin/thickness-reports/[id]/ai-anomaly", async () => {
    const res = await THICKNESS_AI(req(), params({ reportId: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/admin/customer-messages/[id]/ai-extract", async () => {
    const res = await MSG_EXTRACT_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/insurer/cases/[id]/ai-summary", async () => {
    const res = await CASE_SUMMARY_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
  it("/insurer/cases/[id]/ai-assign-suggest", async () => {
    const res = await CASE_ASSIGN_AI(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────
// 2) plan gate — free tier returns 403 plan_limit
// ─────────────────────────────────────────────────────────────
describe("plan gate — free tier returns 403 plan_limit", () => {
  beforeEach(() => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "free",
    });
  });

  it("/admin/jobs/[id]/ai-suggest", async () => {
    const res = await JOB_AI_SUGGEST(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("plan_limit");
  });
  it("/admin/invoices/ai-from-job", async () => {
    const res = await INVOICE_AI(req({ reservation_id: VALID_UUID }));
    expect(res.status).toBe(403);
  });
  it("/admin/accounting/ai-categorize", async () => {
    const res = await ACCOUNTING_AI(
      req({
        fallback_code: "411",
        accounts: [{ code: "411", label: "売上" }],
        lines: [{ description: "x", amount: 1 }],
      }),
    );
    expect(res.status).toBe(403);
  });
  it("/admin/reviews/ai-sentiment", async () => {
    const res = await REVIEW_AI(req({ text: "ok" }));
    expect(res.status).toBe(403);
  });
  it("/admin/translate", async () => {
    const res = await TRANSLATE_AI(req({ text: "hello", target_lang: "en" }));
    expect(res.status).toBe(403);
  });
  it("/admin/master-data/normalize (Starter +)", async () => {
    const res = await NORMALIZE_AI(req({ maker: "TOYOTA" }));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────
// 3) rate limit — limiter returns a 429 short-circuit
// ─────────────────────────────────────────────────────────────
describe("rate limit — 429 is returned before AI is called", () => {
  beforeEach(() => {
    mocks.checkRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, message: "rate limited" }), { status: 429 }),
    );
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
  });

  it("/admin/jobs/[id]/ai-suggest", async () => {
    const res = await JOB_AI_SUGGEST(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(429);
    expect(mocks.generateJobAutoTitle).not.toHaveBeenCalled();
  });
  it("/admin/reviews/ai-sentiment", async () => {
    const res = await REVIEW_AI(req({ text: "ok" }));
    expect(res.status).toBe(429);
    expect(mocks.analyzeReviewSentiment).not.toHaveBeenCalled();
  });
  it("/admin/translate", async () => {
    const res = await TRANSLATE_AI(req({ text: "hello", target_lang: "en" }));
    expect(res.status).toBe(429);
    expect(mocks.translateText).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 4) tenant 設定 enabled=false で AI を呼ばずに 200 ai_disabled を返す
// ─────────────────────────────────────────────────────────────
describe("tenant policy disabled — 200 ai_disabled without calling AI", () => {
  beforeEach(() => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
    mocks.loadSettings.mockResolvedValue({
      enabled: false,
      fieldPolicies: {},
      confidenceThreshold: 0.5,
      sourcePolicies: {},
      loadedFromDb: true,
    });
  });

  it("/admin/jobs/[id]/ai-suggest", async () => {
    const res = await JOB_AI_SUGGEST(req(), params({ id: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_disabled).toBe(true);
    expect(mocks.generateJobAutoTitle).not.toHaveBeenCalled();
    expect(mocks.generateJobNextAction).not.toHaveBeenCalled();
    expect(mocks.generateTimerAlert).not.toHaveBeenCalled();
  });

  it("/admin/translate", async () => {
    const res = await TRANSLATE_AI(req({ text: "hello", target_lang: "en" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_disabled).toBe(true);
    expect(body.translated).toBe("hello"); // 元テキストをそのまま返す
    expect(mocks.translateText).not.toHaveBeenCalled();
  });

  it("/admin/reviews/ai-sentiment", async () => {
    const res = await REVIEW_AI(req({ text: "ok" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_disabled).toBe(true);
    expect(mocks.analyzeReviewSentiment).not.toHaveBeenCalled();
  });

  it("/admin/master-data/normalize", async () => {
    const res = await NORMALIZE_AI(req({ maker: "TOYOTA" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_disabled).toBe(true);
  });

  it("/admin/inventory/ai-pos-deduct", async () => {
    const res = await INVENTORY_AI(
      req({
        sales: [{ menu_item_id: VALID_UUID, menu_item_name: "n", sold_quantity: 1 }],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_disabled).toBe(true);
    expect(mocks.suggestPosDeductions).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// 5) schema validation — 400 on missing required fields
// ─────────────────────────────────────────────────────────────
describe("schema validation — 400 on bad input", () => {
  beforeEach(() => {
    mocks.resolveCaller.mockResolvedValue({
      userId: "u1",
      tenantId: "tenant-1",
      role: "admin",
      planTier: "standard",
    });
  });

  it("/admin/invoices/ai-from-job rejects missing reservation_id", async () => {
    const res = await INVOICE_AI(req({}));
    expect(res.status).toBe(400);
  });
  it("/admin/quotes/ai-from-vehicle rejects empty service_category", async () => {
    const res = await QUOTE_AI(req({ vehicle_id: VALID_UUID, service_category: "" }));
    expect(res.status).toBe(400);
  });
  it("/admin/reviews/ai-sentiment rejects empty text", async () => {
    const res = await REVIEW_AI(req({ text: "" }));
    expect(res.status).toBe(400);
  });
  it("/admin/translate rejects unsupported language", async () => {
    const res = await TRANSLATE_AI(req({ text: "hello", target_lang: "de" }));
    expect(res.status).toBe(400);
  });
  it("/admin/accounting/ai-categorize rejects empty lines array", async () => {
    const res = await ACCOUNTING_AI(
      req({
        fallback_code: "411",
        accounts: [{ code: "411", label: "売上" }],
        lines: [],
      }),
    );
    expect(res.status).toBe(400);
  });
});
