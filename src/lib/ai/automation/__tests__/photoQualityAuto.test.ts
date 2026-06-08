/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/photoQualityCheck", () => ({ auditCertificatePhotos: (...a: any[]) => auditMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoQualityCheckForCertificate } from "../photoQualityAuto";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../policy";
import { emptyStore, makeFakeAdmin } from "./fakeSupabaseAdmin";

const TENANT = "t1";
const CERT = "cert1";

const settings = (autoActions: Record<string, boolean>, enabled = true) => ({
  ...DEFAULT_AI_AUTOMATION_SETTINGS,
  enabled,
  autoActions,
});

const baseStore = (serviceType: string | null = "coating") =>
  emptyStore({
    tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
    certificates: [
      {
        id: CERT,
        tenant_id: TENANT,
        service_type: serviceType,
        quality_fields_json: { material_name: "テスト塗料" },
        meta: null,
      },
    ],
    standard_rules: [
      {
        id: "r1",
        category: "coating",
        category_label: "コーティング",
        is_active: true,
        version: 1,
        required_photos: [],
        required_fields: [],
        warning_rules: [],
        standard_level: "basic",
      },
    ],
    certificate_images: [
      { id: "img1", tenant_id: TENANT, certificate_id: CERT, storage_path: "p1", content_type: "image/jpeg" },
    ],
  });

describe("maybeAutoQualityCheckForCertificate (#7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue({
      overallStatus: "warning",
      standardLevel: "basic",
      score: 70,
      missingPhotos: [],
      missingFields: [],
      warningMessages: [],
    });
  });

  it("opt-in OFF: 監査しない", async () => {
    h.settings = settings({});
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoQualityCheckForCertificate({ tenantId: TENANT, certificateId: CERT });
    expect(auditMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("opt-in ON: meta.quality_check を source=auto で保存", async () => {
    h.settings = settings({ "photo.auto_quality_check": true });
    const store = baseStore();
    h.admin = makeFakeAdmin(store);
    await maybeAutoQualityCheckForCertificate({ tenantId: TENANT, certificateId: CERT });
    expect(auditMock).toHaveBeenCalledTimes(1);
    const upd = store.updates.find((u) => u.table === "certificates");
    expect(upd?.payload.meta.quality_check.source).toBe("auto");
    expect(upd?.payload.meta.quality_check.score).toBe(70);
  });

  it("service_type 無し: standard_rule を引けないのでスキップ", async () => {
    h.settings = settings({ "photo.auto_quality_check": true });
    const store = baseStore(null);
    h.admin = makeFakeAdmin(store);
    await maybeAutoQualityCheckForCertificate({ tenantId: TENANT, certificateId: CERT });
    expect(auditMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it("quality_fields_json が空: スナップショット無しは誤検知回避でスキップ", async () => {
    h.settings = settings({ "photo.auto_quality_check": true });
    const store = baseStore();
    store.tables.certificates[0].quality_fields_json = {};
    h.admin = makeFakeAdmin(store);
    await maybeAutoQualityCheckForCertificate({ tenantId: TENANT, certificateId: CERT });
    expect(auditMock).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });
});
