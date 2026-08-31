/**
 * IMP-028: evaluateCertificateActivationGate() が実データ依存3関数に正しい引数を渡すかを検証する。
 *
 * `/code-review` 指摘 (2026-08-31): hasUnresolvedConcerns() に certificateId しか渡さないと、
 * parts_confirmation・body_repair_tracking 経由の懸念 (certificate_id が null, job_id のみ) を
 * 見逃す。この回帰を防ぐため、jobId (= reservationId) も渡していることを固定する。
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  hasPhotos: vi.fn(),
  hasBeforeAfter: vi.fn(),
  hasUnresolvedConcerns: vi.fn(),
  getPartsIntegrityFindings: vi.fn(),
}));

vi.mock("../photoRequirement", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    certificateHasRequiredPhotos: mocks.hasPhotos,
    certificateHasRequiredBeforeAfterMedia: mocks.hasBeforeAfter,
  };
});
vi.mock("@/lib/concerns/blockCheck", () => ({ hasUnresolvedConcerns: mocks.hasUnresolvedConcerns }));
vi.mock("@/lib/parts/partsIntegrity", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, getPartsIntegrityFindings: mocks.getPartsIntegrityFindings };
});

import { evaluateCertificateActivationGate } from "../activationGate";

const FAKE_ADMIN = {} as SupabaseClient;

describe("evaluateCertificateActivationGate()", () => {
  it("hasUnresolvedConcerns に certificateId と jobId(=reservationId) の両方を渡す", async () => {
    mocks.hasPhotos.mockResolvedValue(true);
    mocks.hasBeforeAfter.mockResolvedValue(true);
    mocks.hasUnresolvedConcerns.mockResolvedValue(false);
    mocks.getPartsIntegrityFindings.mockResolvedValue([]);

    await evaluateCertificateActivationGate(FAKE_ADMIN, {
      certificateId: "cert-1",
      tenantId: "tenant-1",
      serviceType: "coating",
      reservationId: "res-1",
    });

    expect(mocks.hasUnresolvedConcerns).toHaveBeenCalledWith(FAKE_ADMIN, "tenant-1", {
      certificateId: "cert-1",
      jobId: "res-1",
    });
  });

  it("reservationId が無い証明書では jobId を undefined で渡す（certificateId 単独で判定）", async () => {
    mocks.hasPhotos.mockResolvedValue(true);
    mocks.hasBeforeAfter.mockResolvedValue(true);
    mocks.hasUnresolvedConcerns.mockResolvedValue(false);
    mocks.getPartsIntegrityFindings.mockResolvedValue([]);

    await evaluateCertificateActivationGate(FAKE_ADMIN, {
      certificateId: "cert-2",
      tenantId: "tenant-1",
      serviceType: null,
      reservationId: null,
    });

    expect(mocks.hasUnresolvedConcerns).toHaveBeenCalledWith(FAKE_ADMIN, "tenant-1", {
      certificateId: "cert-2",
      jobId: undefined,
    });
  });

  it("懸念が未解決なら ready=false で no_unresolved_alerts が理由になる", async () => {
    mocks.hasPhotos.mockResolvedValue(true);
    mocks.hasBeforeAfter.mockResolvedValue(true);
    mocks.hasUnresolvedConcerns.mockResolvedValue(true);
    mocks.getPartsIntegrityFindings.mockResolvedValue([]);

    const result = await evaluateCertificateActivationGate(FAKE_ADMIN, {
      certificateId: "cert-3",
      tenantId: "tenant-1",
      serviceType: null,
      reservationId: "res-3",
    });

    expect(result.ready).toBe(false);
    expect(result.conditions.find((c) => c.condition === "no_unresolved_alerts")?.met).toBe(false);
  });
});
