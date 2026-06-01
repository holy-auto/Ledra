import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  cert: vi.fn().mockResolvedValue(undefined),
  invoice: vi.fn().mockResolvedValue(undefined),
  thickness: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/automation/certificateRecordAuto", () => ({
  maybeAutoCreateDraftCertificateForReservation: mocks.cert,
}));
vi.mock("@/lib/ai/automation/invoiceRecordAuto", () => ({
  maybeAutoCreateDraftInvoiceForReservation: mocks.invoice,
}));
vi.mock("@/lib/ai/automation/thicknessStepAuto", () => ({
  maybeAutoDetectThicknessForReservation: mocks.thickness,
}));

import { runStepAutomationOnReach, stepAutomationSemantics } from "@/lib/workflow/stepAutomations";

const ctx = { tenantId: "t1", reservationId: "r1" };

beforeEach(() => vi.clearAllMocks());

describe("stepAutomations registry", () => {
  it("registers certificate, billing, and inspection automations", () => {
    const s = stepAutomationSemantics();
    expect(s).toContain("certificate");
    expect(s).toContain("billing");
    expect(s).toContain("inspection");
  });

  it("runs the certificate automation when reaching a 証明書 step", async () => {
    const semantic = await runStepAutomationOnReach({ key: "certificate", label: "証明書発行" }, ctx);
    expect(semantic).toBe("certificate");
    expect(mocks.cert).toHaveBeenCalledWith(ctx);
    expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("runs the invoice automation when reaching a 会計 step", async () => {
    const semantic = await runStepAutomationOnReach({ key: "billing", label: "会計" }, ctx);
    expect(semantic).toBe("billing");
    expect(mocks.invoice).toHaveBeenCalledWith(ctx);
    expect(mocks.cert).not.toHaveBeenCalled();
  });

  it("runs the thickness detection when reaching a 検査 step", async () => {
    const semantic = await runStepAutomationOnReach({ key: "inspect", label: "検査・仕上げ" }, ctx);
    expect(semantic).toBe("inspection");
    expect(mocks.thickness).toHaveBeenCalledWith(ctx);
    expect(mocks.cert).not.toHaveBeenCalled();
    expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("does nothing for an operational (non-semantic) step", async () => {
    const semantic = await runStepAutomationOnReach({ key: "wash", label: "洗車" }, ctx);
    expect(semantic).toBeNull();
    expect(mocks.cert).not.toHaveBeenCalled();
    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.thickness).not.toHaveBeenCalled();
  });

  it("does nothing for a null step", async () => {
    expect(await runStepAutomationOnReach(null, ctx)).toBeNull();
  });
});
