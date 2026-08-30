import { describe, it, expect } from "vitest";
import {
  isVersionTracked,
  isCorrectable,
  isValidDocumentCorrectionStatusTransition,
  computeVersionDiff,
  requiresCorrectionWorkflow,
} from "../documentVersion";

// ── isVersionTracked ──

describe("isVersionTracked", () => {
  it("draft → false（未確定は版管理対象外）", () => {
    expect(isVersionTracked("draft")).toBe(false);
  });

  it.each(["sent", "accepted", "paid", "overdue", "rejected", "cancelled"] as const)("%s → true", (status) => {
    expect(isVersionTracked(status)).toBe(true);
  });
});

// ── isCorrectable ──

describe("isCorrectable", () => {
  it.each(["sent", "accepted", "overdue"] as const)("%s → true", (status) => {
    expect(isCorrectable(status)).toBe(true);
  });

  it.each(["draft", "paid", "rejected", "cancelled"] as const)("%s → false", (status) => {
    expect(isCorrectable(status)).toBe(false);
  });
});

// ── isValidDocumentCorrectionStatusTransition ──

describe("isValidDocumentCorrectionStatusTransition", () => {
  it("pending → approved: valid", () => {
    expect(isValidDocumentCorrectionStatusTransition("pending", "approved")).toBe(true);
  });

  it("pending → rejected: valid", () => {
    expect(isValidDocumentCorrectionStatusTransition("pending", "rejected")).toBe(true);
  });

  it("approved → applied: valid", () => {
    expect(isValidDocumentCorrectionStatusTransition("approved", "applied")).toBe(true);
  });

  it("pending → applied: invalid（承認をスキップできない）", () => {
    expect(isValidDocumentCorrectionStatusTransition("pending", "applied")).toBe(false);
  });

  it("rejected → approved: invalid（却下後の承認はできない）", () => {
    expect(isValidDocumentCorrectionStatusTransition("rejected", "approved")).toBe(false);
  });

  it("applied → pending: invalid（適用後の巻き戻しはできない）", () => {
    expect(isValidDocumentCorrectionStatusTransition("applied", "pending")).toBe(false);
  });
});

// ── computeVersionDiff ──

describe("computeVersionDiff", () => {
  it("金額差分を計算", () => {
    const diff = computeVersionDiff({ total: 50000, itemCount: 3 }, { total: 55000, itemCount: 4 });
    expect(diff.totalDifference).toBe(5000);
    expect(diff.totalDifferenceRate).toBe(10);
    expect(diff.itemCountDifference).toBe(1);
  });

  it("減額", () => {
    const diff = computeVersionDiff({ total: 100000, itemCount: 5 }, { total: 80000, itemCount: 4 });
    expect(diff.totalDifference).toBe(-20000);
    expect(diff.totalDifferenceRate).toBe(-20);
    expect(diff.itemCountDifference).toBe(-1);
  });

  it("前版が 0 → 差額率 0", () => {
    const diff = computeVersionDiff({ total: 0, itemCount: 0 }, { total: 10000, itemCount: 1 });
    expect(diff.totalDifferenceRate).toBe(0);
  });
});

// ── requiresCorrectionWorkflow ──

describe("requiresCorrectionWorkflow", () => {
  it("invoice + sent → true", () => {
    expect(requiresCorrectionWorkflow("invoice", "sent")).toBe(true);
  });

  it("estimate + accepted → true", () => {
    expect(requiresCorrectionWorkflow("estimate", "accepted")).toBe(true);
  });

  it("consolidated_invoice + overdue → true", () => {
    expect(requiresCorrectionWorkflow("consolidated_invoice", "overdue")).toBe(true);
  });

  it("delivery + sent → false（納品書は訂正ワークフロー対象外）", () => {
    expect(requiresCorrectionWorkflow("delivery", "sent")).toBe(false);
  });

  it("invoice + draft → false（ドラフトは自由編集可）", () => {
    expect(requiresCorrectionWorkflow("invoice", "draft")).toBe(false);
  });

  it("invoice + paid → false（入金済みは訂正不可）", () => {
    expect(requiresCorrectionWorkflow("invoice", "paid")).toBe(false);
  });
});
