/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * D-A2 回帰確認: Bearer トークン認証(resolveMobileCaller)で車検証 OCR が
 * 機能すること（cookie セッション専用の Web 版ルートを叩いて常に 401 に
 * なっていた不具合の修正）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  hasPermission: vi.fn(() => true),
  checkRateLimit: vi.fn(async () => null),
  loadAiAutomationSettings: vi.fn(),
  isSourceAllowed: vi.fn(() => true),
  filterVehicleOcrByPolicy: vi.fn((raw: unknown) => ({ extracted: raw, policies: {} })),
  resolveFieldPolicy: vi.fn(() => "manual"),
  parseShakenshoAuto: vi.fn(),
  fuzzyMatchCustomer: vi.fn(),
  detectMagicByteMime: vi.fn(() => "image/jpeg"),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/auth/permissions", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/ai/automation/policy", () => ({
  loadAiAutomationSettings: mocks.loadAiAutomationSettings,
  isSourceAllowed: mocks.isSourceAllowed,
  filterVehicleOcrByPolicy: mocks.filterVehicleOcrByPolicy,
  resolveFieldPolicy: mocks.resolveFieldPolicy,
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ocr/shakensho", () => ({
  parseShakenshoAuto: mocks.parseShakenshoAuto,
  extractFirstRegistrationYear: () => 2020,
  calcSizeClass: () => "compact",
}));
vi.mock("@/lib/ai/customerFuzzyMatch", () => ({ fuzzyMatchCustomer: mocks.fuzzyMatchCustomer }));
vi.mock("@/lib/media/magicBytes", () => ({ detectMagicByteMime: mocks.detectMagicByteMime }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: () => ({}) },
}));

import { POST } from "../route";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function jpegFile(): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], "shakken.jpg", { type: "image/jpeg" });
}

function multipartReq(file?: File | null): Request {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("https://x/api/mobile/vehicles/parse-shakken", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasPermission.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.isSourceAllowed.mockReturnValue(true);
  mocks.detectMagicByteMime.mockReturnValue("image/jpeg");
  mocks.resolveMobileCaller.mockResolvedValue({
    userId: USER_ID,
    tenantId: TENANT_ID,
    role: "staff",
    supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: true, monthlyCostCapJpy: null });
  mocks.filterVehicleOcrByPolicy.mockImplementation((raw: unknown) => ({ extracted: raw, policies: {} }));
  mocks.parseShakenshoAuto.mockResolvedValue({
    data: { maker: "トヨタ", model: "プリウス", vin: "ABC123" },
    source: "vision",
  });
});

describe("POST /api/mobile/vehicles/parse-shakken", () => {
  it("Bearer 未認証 (resolveMobileCaller が null) なら 401", async () => {
    mocks.resolveMobileCaller.mockResolvedValue(null);
    const res: any = await POST(multipartReq(jpegFile()) as any);
    expect(res.status).toBe(401);
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
  });

  it("vehicles:create 権限が無ければ 403", async () => {
    mocks.hasPermission.mockReturnValue(false);
    const res: any = await POST(multipartReq(jpegFile()) as any);
    expect(res.status).toBe(403);
  });

  it("file が無ければ 400", async () => {
    const res: any = await POST(multipartReq(null) as any);
    expect(res.status).toBe(400);
  });

  it("AI 無効時は OCR を呼ばず空の抽出結果を返す", async () => {
    mocks.loadAiAutomationSettings.mockResolvedValue({ enabled: false, monthlyCostCapJpy: null });
    const res: any = await POST(multipartReq(jpegFile()) as any);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ai_disabled).toBe(true);
    expect(body.extracted.maker).toBeNull();
    expect(mocks.parseShakenshoAuto).not.toHaveBeenCalled();
  });

  it("Bearer 認証で OCR を実行し抽出結果を返す (D-A2 回帰確認)", async () => {
    const res: any = await POST(multipartReq(jpegFile()) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.source).toBe("vision");
    expect(mocks.resolveMobileCaller).toHaveBeenCalledTimes(1);
    expect(mocks.parseShakenshoAuto).toHaveBeenCalledTimes(1);
  });
});
