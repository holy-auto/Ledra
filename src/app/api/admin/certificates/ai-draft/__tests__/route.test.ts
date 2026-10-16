/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/certificates/ai-draft — 作成中フォームの写真を下書きの材料にする。
 *
 * - multipart で写真付き → 写真の Vision 結果を photoDescriptions として下書き生成に渡す
 * - 写真ソースが無効 → Vision を呼ばない
 * - JSON (写真なし) → 従来どおり Vision を呼ばない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  loadSettings: vi.fn(),
  generateDraft: vi.fn(),
  draftPhotoContent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/checkRole", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, resolveCallerWithRole: mocks.resolveCaller };
});
vi.mock("@/lib/ai/automation/policy", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, loadAiAutomationSettings: mocks.loadSettings };
});
vi.mock("@/lib/ai/draftCertificate", () => ({ generateCertificateDraft: mocks.generateDraft }));
vi.mock("@/lib/ai/photoContentDraft", () => ({ draftPhotoContent: mocks.draftPhotoContent }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// vehicles.single() と certificates.limit() の両方に応える最小の chain。
function chain(result: unknown): any {
  const c: any = {};
  for (const m of ["select", "eq", "not", "order"]) c[m] = () => c;
  c.single = async () => ({ data: { maker: "トヨタ", model: "プリウス" } });
  c.limit = async () => result;
  return c;
}
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: { from: () => chain({ data: [] }) }, tenantId: "t1" }),
}));

import { POST } from "@/app/api/admin/certificates/ai-draft/route";

const VEHICLE = "00000000-0000-4000-8000-000000000001";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const EMPTY_DRAFT = {
  title: "",
  description: "",
  materials: [],
  warrantyCandidates: [],
  workAreas: [],
  cautions: "",
  confidence: 0.5,
  missingInfo: [],
};

function multipartReq() {
  const form = new FormData();
  form.append("vehicle_id", VEHICLE);
  form.append("photos", new File([Buffer.from(JPEG)], "a.jpg", { type: "image/jpeg" }));
  return new Request("http://localhost/api/admin/certificates/ai-draft", { method: "POST", body: form }) as any;
}

function settings(sourcePolicies: Record<string, boolean> = {}) {
  return { enabled: true, fieldPolicies: {}, confidenceThreshold: 0.5, sourcePolicies, loadedFromDb: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveCaller.mockResolvedValue({ tenantId: "t1", userId: "u1", planTier: "pro", role: "staff" });
  mocks.loadSettings.mockResolvedValue(settings());
  mocks.generateDraft.mockResolvedValue(EMPTY_DRAFT);
  mocks.draftPhotoContent.mockResolvedValue({
    serviceCategory: "coating",
    contentDraft: "ボディ全面ガラスコーティング",
    confidence: 0.8,
  });
});

describe("POST ai-draft — 作成中フォームの写真", () => {
  it("写真付きなら Vision の結果を下書き生成に渡す", async () => {
    const res = await POST(multipartReq());
    expect(res.status).toBe(200);
    expect(mocks.draftPhotoContent).toHaveBeenCalledTimes(1);
    expect(mocks.draftPhotoContent.mock.calls[0][0]).toEqual([
      { base64: Buffer.from(JPEG).toString("base64"), mediaType: "image/jpeg" },
    ]);
    expect(mocks.generateDraft.mock.calls[0][0].photoDescriptions).toEqual(["ボディ全面ガラスコーティング"]);
    const json = await res.json();
    expect(json.source_data.photos_analyzed).toBe(1);
  });

  it("Vision が何も読み取れなければ写真を参照した扱いにしない", async () => {
    mocks.draftPhotoContent.mockResolvedValue({ serviceCategory: "other", contentDraft: "", confidence: 0 });
    const res = await POST(multipartReq());
    expect(mocks.generateDraft.mock.calls[0][0].photoDescriptions).toBeUndefined();
    expect((await res.json()).source_data.photos_analyzed).toBe(0);
  });

  it("写真ソースが無効なら Vision を呼ばない", async () => {
    mocks.loadSettings.mockResolvedValue(settings({ photos: false }));
    const res = await POST(multipartReq());
    expect(res.status).toBe(200);
    expect(mocks.draftPhotoContent).not.toHaveBeenCalled();
    expect(mocks.generateDraft.mock.calls[0][0].photoDescriptions).toBeUndefined();
    expect((await res.json()).source_data.photos_analyzed).toBe(0);
  });

  it("JSON (写真なし) は従来どおり Vision を呼ばない", async () => {
    const req = new Request("http://localhost/api/admin/certificates/ai-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: VEHICLE }),
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.draftPhotoContent).not.toHaveBeenCalled();
  });
});
