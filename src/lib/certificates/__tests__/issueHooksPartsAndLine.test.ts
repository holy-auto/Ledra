/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * triggerCertificateIssued の新規副作用 (部品交換 draft 完成 / 顧客への LINE 自動連絡) を検証する。
 * 実 DB は使わず fakeSupabaseAdmin (既存の parts/ai-automation テストと同方針) で検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: null as any }));
const completeMock = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => 0));
const sendLineMock = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => true));

vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({ admin: h.admin, tenantId: "t1" }),
}));
vi.mock("@/lib/qstash/publish", () => ({ enqueueInsuranceCaseCreated: vi.fn(async () => {}) }));
vi.mock("@/lib/anchoring/certificateAnchorService", () => ({ enqueueCertificateAnchor: vi.fn(async () => {}) }));
vi.mock("@/lib/parts/installationService", () => ({
  completeDraftPartInstallationsForReservation: (...a: any[]) => completeMock(...a),
}));
vi.mock("@/lib/line/client", () => ({
  sendCustomerLineText: (...a: any[]) => sendLineMock(...a),
}));

import { triggerCertificateIssued } from "@/lib/certificates/issueHooks";
import { emptyStore, makeFakeAdmin } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const TENANT = "t1";
const CERT = "cert1";
const RESERVATION = "res1";
const CUSTOMER = "cust1";

const baseParams = {
  tenantId: TENANT,
  publicId: "pub1",
  certificateId: CERT,
  customerName: "山田太郎",
};

describe("triggerCertificateIssued — 部品交換 draft 完成", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reservationId があれば draft を installed に完成させる", async () => {
    h.admin = makeFakeAdmin(emptyStore({ follow_up_settings: [], customers: [] }));
    await triggerCertificateIssued({ ...baseParams, reservationId: RESERVATION });
    expect(completeMock).toHaveBeenCalledWith(TENANT, RESERVATION);
  });

  it("reservationId が無ければ draft 完成処理を呼ばない", async () => {
    h.admin = makeFakeAdmin(emptyStore({ follow_up_settings: [], customers: [] }));
    await triggerCertificateIssued({ ...baseParams });
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("triggerCertificateIssued — 証明書発行のLINE自動連絡", () => {
  beforeEach(() => vi.clearAllMocks());

  it("顧客に line_user_id があれば LINE を送る", async () => {
    h.admin = makeFakeAdmin(
      emptyStore({
        follow_up_settings: [],
        customers: [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: "line-abc" }],
      }),
    );
    await triggerCertificateIssued({ ...baseParams, customerId: CUSTOMER });
    expect(sendLineMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, customerId: CUSTOMER, lineUserId: "line-abc" }),
    );
  });

  it("line_user_id が無ければ LINE を送らない", async () => {
    h.admin = makeFakeAdmin(
      emptyStore({
        follow_up_settings: [],
        customers: [{ id: CUSTOMER, tenant_id: TENANT, line_user_id: null }],
      }),
    );
    await triggerCertificateIssued({ ...baseParams, customerId: CUSTOMER });
    expect(sendLineMock).not.toHaveBeenCalled();
  });

  it("customerId が無ければ LINE を送らない", async () => {
    h.admin = makeFakeAdmin(emptyStore({ follow_up_settings: [], customers: [] }));
    await triggerCertificateIssued({ ...baseParams });
    expect(sendLineMock).not.toHaveBeenCalled();
  });
});
