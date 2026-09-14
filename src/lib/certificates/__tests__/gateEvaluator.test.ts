import { describe, it, expect } from "vitest";
import { evaluateCertificateGate } from "../gateEvaluator";
import type { CertificateGateInput } from "../gateEvaluator";
import { CERTIFICATE_GATE_CONDITIONS } from "@/lib/domain/certificateGate";

/** 全条件 met になるベース入力。 */
const baseInput: CertificateGateInput = {
  photoCount: 3,
  hasBeforeAfterMedia: true,
  serviceType: null,
  paymentPolicyResult: { met: true },
  hasUnresolvedConcerns: false,
};

describe("evaluateCertificateGate", () => {
  it("全条件 met → ready: true", () => {
    const result = evaluateCertificateGate(baseInput);
    expect(result.ready).toBe(true);
    expect(result.conditions).toHaveLength(10);
    expect(result.conditions.every((c) => c.met)).toBe(true);
  });

  it("10 条件すべてのキーが返される", () => {
    const result = evaluateCertificateGate(baseInput);
    const keys = result.conditions.map((c) => c.condition);
    expect(keys).toEqual([...CERTIFICATE_GATE_CONDITIONS]);
  });

  it("1 条件でも false → ready: false", () => {
    const result = evaluateCertificateGate({ ...baseInput, hasUnresolvedConcerns: true });
    expect(result.ready).toBe(false);
  });
});

describe("required_evidence_present", () => {
  it("写真 0 枚 → not met", () => {
    const result = evaluateCertificateGate({ ...baseInput, photoCount: 0 });
    const cond = result.conditions.find((c) => c.condition === "required_evidence_present");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toContain("施工写真");
  });

  it("写真 1 枚 → met", () => {
    const result = evaluateCertificateGate({ ...baseInput, photoCount: 1 });
    const cond = result.conditions.find((c) => c.condition === "required_evidence_present");
    expect(cond?.met).toBe(true);
  });

  it("coating + Before/After なし → not met", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      serviceType: "coating",
      hasBeforeAfterMedia: false,
    });
    const cond = result.conditions.find((c) => c.condition === "required_evidence_present");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toContain("Before/After");
  });

  it("ppf + Before/After あり → met", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      serviceType: "ppf",
      hasBeforeAfterMedia: true,
    });
    const cond = result.conditions.find((c) => c.condition === "required_evidence_present");
    expect(cond?.met).toBe(true);
  });

  it("一般サービス + Before/After なし → met（必須でない）", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      serviceType: "bodywork",
      hasBeforeAfterMedia: false,
    });
    const cond = result.conditions.find((c) => c.condition === "required_evidence_present");
    expect(cond?.met).toBe(true);
  });
});

describe("payment_policy_met", () => {
  it("paymentPolicyResult.met: true → met", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      paymentPolicyResult: { met: true },
    });
    const cond = result.conditions.find((c) => c.condition === "payment_policy_met");
    expect(cond?.met).toBe(true);
  });

  it("paymentPolicyResult.met: false → not met + reason", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      paymentPolicyResult: { met: false, reason: "お会計が完了していません。" },
    });
    const cond = result.conditions.find((c) => c.condition === "payment_policy_met");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toBe("お会計が完了していません。");
  });

  it("paymentPolicyResult: null（支払いデータなし）→ met（条件スキップ）", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      paymentPolicyResult: null,
    });
    const cond = result.conditions.find((c) => c.condition === "payment_policy_met");
    expect(cond?.met).toBe(true);
  });
});

describe("no_unresolved_alerts", () => {
  it("懸念なし → met", () => {
    const result = evaluateCertificateGate({ ...baseInput, hasUnresolvedConcerns: false });
    const cond = result.conditions.find((c) => c.condition === "no_unresolved_alerts");
    expect(cond?.met).toBe(true);
  });

  it("未解決懸念あり → not met", () => {
    const result = evaluateCertificateGate({ ...baseInput, hasUnresolvedConcerns: true });
    const cond = result.conditions.find((c) => c.condition === "no_unresolved_alerts");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toContain("未解決の顧客懸念");
  });
});

describe("スタブ条件（デフォルト true）", () => {
  const stubConditions = [
    "workflow_completed",
    "evidence_synced",
    "parts_integrity",
    "in_store_review",
    "customer_confirmation_current",
    "no_pending_corrections",
    "approvals_complete",
  ] as const;

  it("明示指定なし → すべて met", () => {
    const result = evaluateCertificateGate(baseInput);
    for (const name of stubConditions) {
      const cond = result.conditions.find((c) => c.condition === name);
      expect(cond?.met).toBe(true);
    }
  });

  it("workflowCompleted: false → not met", () => {
    const result = evaluateCertificateGate({ ...baseInput, workflowCompleted: false });
    const cond = result.conditions.find((c) => c.condition === "workflow_completed");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toContain("ワークフロー");
  });

  it("partsIntegrityOk: false → not met", () => {
    const result = evaluateCertificateGate({ ...baseInput, partsIntegrityOk: false });
    const cond = result.conditions.find((c) => c.condition === "parts_integrity");
    expect(cond?.met).toBe(false);
  });

  it("複数条件 false → ready: false + 不足条件の detail が設定される", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      workflowCompleted: false,
      hasUnresolvedConcerns: true,
      paymentPolicyResult: { met: false, reason: "未払い" },
    });
    expect(result.ready).toBe(false);
    const failed = result.conditions.filter((c) => !c.met);
    expect(failed).toHaveLength(3);
    expect(failed.every((c) => c.detail != null)).toBe(true);
  });
});
