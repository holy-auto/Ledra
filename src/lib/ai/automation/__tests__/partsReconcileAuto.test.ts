/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any, settings: null as any }));
const extractMock = vi.hoisted(() => vi.fn());
const toLineItemsMock = vi.hoisted(() => vi.fn());
const reconcileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => h.admin,
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: vi.fn() }) }));
vi.mock("@/lib/ai/deliveryNoteOcr", () => ({
  extractDeliveryNote: (...a: any[]) => extractMock(...a),
  toLineItems: (...a: any[]) => toLineItemsMock(...a),
}));
vi.mock("@/lib/parts/reconcileService", () => ({ reconcileInstallation: (...a: any[]) => reconcileMock(...a) }));
vi.mock("../policy", async (orig) => {
  const actual = await orig<typeof import("../policy")>();
  return { ...actual, loadAiAutomationSettings: async () => h.settings };
});

import { maybeAutoReconcileDeliveryNote } from "../partsReconcileAuto";
import { DEFAULT_AI_AUTOMATION_SETTINGS } from "../policy";
import { emptyStore, makeFakeAdmin } from "./fakeSupabaseAdmin";

const TENANT = "t1";
const INST = "inst1";
const EV = "ev1";

const settings = (autoActions: Record<string, boolean>, enabled = true) => ({
  ...DEFAULT_AI_AUTOMATION_SETTINGS,
  enabled,
  autoActions,
});

/** ocr_extracted を持つ evidence (画像取得・OCR 不要のパス)。 */
const storeWithCachedOcr = () =>
  emptyStore({
    tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
    part_installation_evidence: [
      {
        id: EV,
        tenant_id: TENANT,
        installation_id: INST,
        kind: "delivery_note",
        storage_path: null,
        content_type: null,
        ocr_extracted: { lines: [{ name: "ブレーキパッド", quantity: 2 }] },
      },
    ],
  });

/** 画像のみ (storage から取得 → OCR) のパス。 */
const storeWithImage = () => {
  const s = emptyStore(
    {
      tenants: [{ id: TENANT, is_active: true, plan_tier: "standard" }],
      part_installation_evidence: [
        {
          id: EV,
          tenant_id: TENANT,
          installation_id: INST,
          kind: "delivery_note",
          storage_path: "parts/t1/inst1/dn.jpg",
          content_type: "image/jpeg",
          ocr_extracted: null,
        },
      ],
    },
    { "parts/t1/inst1/dn.jpg": "fake-image-bytes" },
  );
  return s;
};

describe("maybeAutoReconcileDeliveryNote (#28)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toLineItemsMock.mockReturnValue([{ key: "ブレーキパッド", quantity: 2, amountJpy: null, label: "ブレーキパッド" }]);
    extractMock.mockResolvedValue({ lines: [{ name: "ブレーキパッド", quantity: 2 }] });
    reconcileMock.mockResolvedValue([]);
  });

  it("opt-in OFF: 照合しない", async () => {
    h.settings = settings({});
    h.admin = makeFakeAdmin(storeWithCachedOcr());
    await maybeAutoReconcileDeliveryNote({ tenantId: TENANT, installationId: INST, evidenceId: EV });
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("opt-in ON + ocr_extracted あり: OCR を呼ばず三方照合を実行", async () => {
    h.settings = settings({ "parts.auto_reconcile_delivery_note": true });
    h.admin = makeFakeAdmin(storeWithCachedOcr());
    await maybeAutoReconcileDeliveryNote({ tenantId: TENANT, installationId: INST, evidenceId: EV });
    expect(extractMock).not.toHaveBeenCalled();
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock).toHaveBeenCalledWith(TENANT, INST, [
      { key: "ブレーキパッド", quantity: 2, amountJpy: null, label: "ブレーキパッド" },
    ]);
  });

  it("opt-in ON + 画像のみ: assets から取得して OCR → 三方照合", async () => {
    h.settings = settings({ "parts.auto_reconcile_delivery_note": true });
    h.admin = makeFakeAdmin(storeWithImage());
    await maybeAutoReconcileDeliveryNote({ tenantId: TENANT, installationId: INST, evidenceId: EV });
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock).toHaveBeenCalledTimes(1);
  });

  it("kind が delivery_note でない evidence はスキップ", async () => {
    h.settings = settings({ "parts.auto_reconcile_delivery_note": true });
    const s = storeWithCachedOcr();
    s.tables.part_installation_evidence[0].kind = "install_photo";
    h.admin = makeFakeAdmin(s);
    await maybeAutoReconcileDeliveryNote({ tenantId: TENANT, installationId: INST, evidenceId: EV });
    expect(reconcileMock).not.toHaveBeenCalled();
  });
});
