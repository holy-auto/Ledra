/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * IMP-028: certificateRecordAuto の自動発行 (draft→active) が Certificate Gate を
 * 経由すること、gate が ready でなければ draft のまま残ることを検証する。
 *
 * `certificateMileageKm` は本来 AI 下書きに走行距離情報が無く常に null (=常に draft) だが、
 * それは別のガード (走行距離必須ルール) の話であり、ここで検証したいのは Certificate Gate
 * 側の配線なので、mileage は常に確定済みとしてモックし gate 呼び出しの分岐だけを見る。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyStore, makeFakeAdmin, type FakeStore } from "./fakeSupabaseAdmin";

const mocks = vi.hoisted(() => ({
  loadAiAutomationSettings: vi.fn(),
  shouldAutoCreateDraftCertificate: vi.fn(),
  shouldAutoIssueCertificate: vi.fn(),
  evaluateCertificateActivationGate: vi.fn(),
  triggerCertificateIssued: vi.fn(),
  usageRecord: vi.fn(),
  logAutoActionExecuted: vi.fn(),
  store: null as unknown as FakeStore,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => makeFakeAdmin(mocks.store),
}));
vi.mock("../policy", () => ({ loadAiAutomationSettings: mocks.loadAiAutomationSettings }));
vi.mock("../orchestrator", () => ({
  shouldAutoCreateDraftCertificate: mocks.shouldAutoCreateDraftCertificate,
  shouldAutoIssueCertificate: mocks.shouldAutoIssueCertificate,
}));
vi.mock("@/lib/certificates/activationGate", () => ({
  evaluateCertificateActivationGate: mocks.evaluateCertificateActivationGate,
}));
vi.mock("@/lib/maintenance/mileage", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  // 走行距離必須ルールは別ガードなので常に確定済み扱いにし、Certificate Gate 側の
  // 分岐だけを検証する（理由は本ファイル先頭のコメント参照）。
  return { ...real, certificateMileageKm: () => 35000 };
});
vi.mock("@/lib/certificates/issueHooks", () => ({ triggerCertificateIssued: mocks.triggerCertificateIssued }));
vi.mock("@/lib/ai/recordRouteUsage", () => ({ startAiRouteUsage: () => ({ record: mocks.usageRecord }) }));
vi.mock("@/lib/audit/aiAuditLog", () => ({ logAutoActionExecuted: mocks.logAutoActionExecuted }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { maybeAutoCreateDraftCertificateForReservation } from "../certificateRecordAuto";

const TENANT = "11111111-1111-1111-1111-111111111111";
const RESERVATION = "22222222-2222-4222-a222-222222222222";
const VEHICLE = "33333333-3333-4333-a333-333333333333";
const CUSTOMER = "44444444-4444-4444-a444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store = emptyStore({
    tenants: [{ id: TENANT, plan_tier: "pro", is_active: true }],
    reservations: [
      {
        id: RESERVATION,
        tenant_id: TENANT,
        vehicle_id: VEHICLE,
        customer_id: CUSTOMER,
        title: "コーティング施工",
        ai_certificate_draft: null,
        ai_certificate_id: null,
        parts_replacement: false,
      },
    ],
    customers: [{ id: CUSTOMER, tenant_id: TENANT, name: "田中太郎" }],
    vehicles: [{ id: VEHICLE, maker: "トヨタ", model: "プリウス", year: 2020, plate_display: "品川 300 あ 12-34" }],
    certificates: [],
  });
  mocks.loadAiAutomationSettings.mockResolvedValue({});
  mocks.shouldAutoCreateDraftCertificate.mockReturnValue(true);
  mocks.shouldAutoIssueCertificate.mockReturnValue(true);
  mocks.triggerCertificateIssued.mockResolvedValue(undefined);
});

describe("maybeAutoCreateDraftCertificateForReservation — Certificate Gate 配線 (IMP-028)", () => {
  it("gate が ready → active化し、発行フックを呼ぶ", async () => {
    mocks.evaluateCertificateActivationGate.mockResolvedValue({ ready: true, conditions: [] });

    await maybeAutoCreateDraftCertificateForReservation({ tenantId: TENANT, reservationId: RESERVATION });

    // 作成は常に draft (insert と activate を分離: activationGate.ts コメント参照)。
    expect(mocks.store.inserts).toHaveLength(1);
    expect(mocks.store.inserts[0].payload.status).toBe("draft");
    expect(mocks.evaluateCertificateActivationGate).toHaveBeenCalledTimes(1);
    // gate ready → 続けて active に update する。
    const certUpdates = mocks.store.updates.filter((u) => u.table === "certificates");
    expect(certUpdates).toHaveLength(1);
    expect(certUpdates[0].payload).toMatchObject({ status: "active" });
    expect(mocks.triggerCertificateIssued).toHaveBeenCalledTimes(1);
  });

  it("gate が ready でない → draft のまま残り、発行フックを呼ばない", async () => {
    mocks.evaluateCertificateActivationGate.mockResolvedValue({
      ready: false,
      conditions: [{ condition: "required_evidence_present", met: false, detail: "写真がありません。" }],
    });

    await maybeAutoCreateDraftCertificateForReservation({ tenantId: TENANT, reservationId: RESERVATION });

    expect(mocks.evaluateCertificateActivationGate).toHaveBeenCalledTimes(1);
    // gate が ready でないので active への update は一切呼ばない。
    expect(mocks.store.updates.filter((u) => u.table === "certificates")).toHaveLength(0);
    expect(mocks.triggerCertificateIssued).not.toHaveBeenCalled();
  });

  it("自動発行が無効 (shouldAutoIssueCertificate=false) なら gate 自体を評価しない", async () => {
    mocks.shouldAutoIssueCertificate.mockReturnValue(false);

    await maybeAutoCreateDraftCertificateForReservation({ tenantId: TENANT, reservationId: RESERVATION });

    expect(mocks.evaluateCertificateActivationGate).not.toHaveBeenCalled();
    expect(mocks.store.inserts[0].payload.status).toBe("draft");
    expect(mocks.store.updates.filter((u) => u.table === "certificates")).toHaveLength(0);
  });
});
