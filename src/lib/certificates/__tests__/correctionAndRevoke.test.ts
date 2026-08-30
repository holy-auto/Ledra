import { describe, it, expect } from "vitest";

// ── correction ──
import {
  CORRECTION_REQUEST_STATUSES,
  CORRECTION_CATEGORIES,
  evaluateCorrectionEligibility,
  isValidCorrectionTransition,
  hasPendingOrApprovedCorrection,
} from "../correction";

// ── integrityIncident ──
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  evaluateRevokeEligibility,
  isValidIncidentTransition,
  requiresImmediateRevoke,
} from "../integrityIncident";

// ── versionTransition ──
import { evaluateSupersede, evaluateRevoke, resolveVersionRedirect } from "../versionTransition";

// ── gateEvaluator (no_pending_corrections) ──
import { evaluateCertificateGate } from "../gateEvaluator";

// ============================================================
// correction.ts
// ============================================================

describe("correction", () => {
  describe("constants", () => {
    it("5 つの訂正リクエスト状態がある", () => {
      expect(CORRECTION_REQUEST_STATUSES).toHaveLength(5);
    });

    it("5 つの訂正カテゴリがある", () => {
      expect(CORRECTION_CATEGORIES).toHaveLength(5);
    });
  });

  describe("evaluateCorrectionEligibility", () => {
    it("VERIFIED + 訂正なし → eligible", () => {
      const result = evaluateCorrectionEligibility("VERIFIED", false);
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("VERIFIED + 訂正あり → not eligible（二重訂正防止）", () => {
      const result = evaluateCorrectionEligibility("VERIFIED", true);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("未処理の訂正");
    });

    it("NOT_READY → not eligible（通常編集で対応）", () => {
      const result = evaluateCorrectionEligibility("NOT_READY", false);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("通常の編集");
    });

    it("SUPERSEDED → not eligible", () => {
      const result = evaluateCorrectionEligibility("SUPERSEDED", false);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("新しい版に置き換え済み");
    });

    it("REVOKED → not eligible", () => {
      const result = evaluateCorrectionEligibility("REVOKED", false);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("無効化");
    });

    it("PENDING_CORRECTION → not eligible", () => {
      const result = evaluateCorrectionEligibility("PENDING_CORRECTION", false);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("訂正が進行中");
    });
  });

  describe("isValidCorrectionTransition", () => {
    it("pending → approved: true", () => {
      expect(isValidCorrectionTransition("pending", "approved")).toBe(true);
    });
    it("pending → rejected: true", () => {
      expect(isValidCorrectionTransition("pending", "rejected")).toBe(true);
    });
    it("pending → cancelled: true", () => {
      expect(isValidCorrectionTransition("pending", "cancelled")).toBe(true);
    });
    it("approved → applied: true", () => {
      expect(isValidCorrectionTransition("approved", "applied")).toBe(true);
    });
    it("approved → cancelled: true", () => {
      expect(isValidCorrectionTransition("approved", "cancelled")).toBe(true);
    });
    it("rejected → pending: false（終端）", () => {
      expect(isValidCorrectionTransition("rejected", "pending")).toBe(false);
    });
    it("applied → pending: false（終端）", () => {
      expect(isValidCorrectionTransition("applied", "pending")).toBe(false);
    });
    it("pending → applied: false（承認を飛ばせない）", () => {
      expect(isValidCorrectionTransition("pending", "applied")).toBe(false);
    });
    it("未知の状態(Object.prototype のプロパティ名)は false（プロトタイプ汚染防止）", () => {
      // @ts-expect-error -- 境界防御の検証。実行時は文字列がそのまま来る想定。
      expect(isValidCorrectionTransition("constructor", "approved")).toBe(false);
    });
  });

  describe("hasPendingOrApprovedCorrection", () => {
    it("pending があれば true", () => {
      expect(hasPendingOrApprovedCorrection([{ status: "pending" }])).toBe(true);
    });
    it("approved があれば true", () => {
      expect(hasPendingOrApprovedCorrection([{ status: "approved" }])).toBe(true);
    });
    it("applied のみなら false", () => {
      expect(hasPendingOrApprovedCorrection([{ status: "applied" }])).toBe(false);
    });
    it("空配列は false", () => {
      expect(hasPendingOrApprovedCorrection([])).toBe(false);
    });
    it("混在: rejected + pending → true", () => {
      expect(hasPendingOrApprovedCorrection([{ status: "rejected" }, { status: "pending" }])).toBe(true);
    });
  });
});

// ============================================================
// integrityIncident.ts
// ============================================================

describe("integrityIncident", () => {
  describe("constants", () => {
    it("6 つの Incident カテゴリがある", () => {
      expect(INCIDENT_CATEGORIES).toHaveLength(6);
    });
    it("3 つの Incident 重大度がある", () => {
      expect(INCIDENT_SEVERITIES).toHaveLength(3);
    });
    it("5 つの Incident 状態がある", () => {
      expect(INCIDENT_STATUSES).toHaveLength(5);
    });
  });

  describe("evaluateRevokeEligibility", () => {
    it("VERIFIED → eligible", () => {
      const result = evaluateRevokeEligibility("VERIFIED");
      expect(result.eligible).toBe(true);
    });

    it("NOT_READY → not eligible（削除で対応）", () => {
      const result = evaluateRevokeEligibility("NOT_READY");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("削除");
    });

    it("REVOKED → not eligible（既に無効化）", () => {
      const result = evaluateRevokeEligibility("REVOKED");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("既に無効化");
    });

    it("SUPERSEDED → not eligible（最新版で操作）", () => {
      const result = evaluateRevokeEligibility("SUPERSEDED");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("最新版");
    });

    it("ISSUING → eligible（代表判断・2026-08-27: 公開前でも無効化の記録を残す）", () => {
      const result = evaluateRevokeEligibility("ISSUING");
      expect(result.eligible).toBe(true);
    });

    it("VERIFYING → eligible（代表判断・2026-08-27）", () => {
      const result = evaluateRevokeEligibility("VERIFYING");
      expect(result.eligible).toBe(true);
    });

    it("PENDING_CORRECTION → not eligible（訂正完了を待つ）", () => {
      const result = evaluateRevokeEligibility("PENDING_CORRECTION");
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("訂正");
    });
  });

  describe("isValidIncidentTransition", () => {
    it("reported → investigating: true", () => {
      expect(isValidIncidentTransition("reported", "investigating")).toBe(true);
    });
    it("reported → confirmed: true（即時確認）", () => {
      expect(isValidIncidentTransition("reported", "confirmed")).toBe(true);
    });
    it("reported → dismissed: true", () => {
      expect(isValidIncidentTransition("reported", "dismissed")).toBe(true);
    });
    it("investigating → confirmed: true", () => {
      expect(isValidIncidentTransition("investigating", "confirmed")).toBe(true);
    });
    it("confirmed → revoked: true", () => {
      expect(isValidIncidentTransition("confirmed", "revoked")).toBe(true);
    });
    it("revoked → reported: false（終端）", () => {
      expect(isValidIncidentTransition("revoked", "reported")).toBe(false);
    });
    it("dismissed → reported: false（終端）", () => {
      expect(isValidIncidentTransition("dismissed", "reported")).toBe(false);
    });
    it("reported → revoked: false（確認を飛ばせない）", () => {
      expect(isValidIncidentTransition("reported", "revoked")).toBe(false);
    });
    it("未知の状態(Object.prototype のプロパティ名)は false（プロトタイプ汚染防止）", () => {
      // @ts-expect-error -- 境界防御の検証。実行時は文字列がそのまま来る想定。
      expect(isValidIncidentTransition("constructor", "confirmed")).toBe(false);
    });
  });

  describe("requiresImmediateRevoke", () => {
    it("critical + 任意カテゴリ → true", () => {
      expect(requiresImmediateRevoke("critical", "fraud")).toBe(true);
      expect(requiresImmediateRevoke("critical", "other")).toBe(true);
    });
    it("high + tampering → true", () => {
      expect(requiresImmediateRevoke("high", "tampering")).toBe(true);
    });
    it("high + fraud → false（調査が必要）", () => {
      expect(requiresImmediateRevoke("high", "fraud")).toBe(false);
    });
    it("medium → false", () => {
      expect(requiresImmediateRevoke("medium", "tampering")).toBe(false);
    });
  });
});

// ============================================================
// versionTransition.ts
// ============================================================

describe("versionTransition", () => {
  describe("evaluateSupersede", () => {
    it("VERIFIED → SUPERSEDED: valid", () => {
      const result = evaluateSupersede("VERIFIED");
      expect(result.valid).toBe(true);
      expect(result.oldVersionState).toBe("SUPERSEDED");
      expect(result.newVersionState).toBe("VERIFIED");
    });

    it("NOT_READY → SUPERSEDED: invalid", () => {
      const result = evaluateSupersede("NOT_READY");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("VERIFIED");
    });

    it("SUPERSEDED → SUPERSEDED: invalid（終端）", () => {
      const result = evaluateSupersede("SUPERSEDED");
      expect(result.valid).toBe(false);
    });

    it("REVOKED → SUPERSEDED: invalid", () => {
      const result = evaluateSupersede("REVOKED");
      expect(result.valid).toBe(false);
    });
  });

  describe("evaluateRevoke", () => {
    it("VERIFIED → REVOKED: valid", () => {
      const result = evaluateRevoke("VERIFIED");
      expect(result.valid).toBe(true);
      expect(result.newState).toBe("REVOKED");
    });

    it("NOT_READY → REVOKED: invalid", () => {
      const result = evaluateRevoke("NOT_READY");
      expect(result.valid).toBe(false);
    });

    it("REVOKED → REVOKED: invalid（既に終端）", () => {
      const result = evaluateRevoke("REVOKED");
      expect(result.valid).toBe(false);
    });

    it("ISSUING → REVOKED: valid（代表判断・2026-08-27）", () => {
      const result = evaluateRevoke("ISSUING");
      expect(result.valid).toBe(true);
      expect(result.newState).toBe("REVOKED");
    });

    it("VERIFYING → REVOKED: valid（代表判断・2026-08-27）", () => {
      const result = evaluateRevoke("VERIFYING");
      expect(result.valid).toBe(true);
    });
  });

  describe("resolveVersionRedirect", () => {
    it("SUPERSEDED → redirect with message", () => {
      const result = resolveVersionRedirect("SUPERSEDED", "new-pub-id");
      expect(result.shouldRedirect).toBe(true);
      expect(result.message).toContain("新しい版");
      expect(result.redirectToPublicId).toBe("new-pub-id");
    });

    it("REVOKED → no redirect, with revocation message", () => {
      const result = resolveVersionRedirect("REVOKED");
      expect(result.shouldRedirect).toBe(false);
      expect(result.message).toContain("無効化");
    });

    it("VERIFIED → no redirect, no message", () => {
      const result = resolveVersionRedirect("VERIFIED");
      expect(result.shouldRedirect).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it("SUPERSEDED without latestPublicId → redirectToPublicId キー自体が無い", () => {
      const result = resolveVersionRedirect("SUPERSEDED");
      expect(result.shouldRedirect).toBe(true);
      expect("redirectToPublicId" in result).toBe(false);
    });
  });
});

// ============================================================
// gateEvaluator.ts — no_pending_corrections 条件の統合テスト
// ============================================================

describe("gateEvaluator: no_pending_corrections", () => {
  /** 基本入力（他条件は全 met） */
  const baseInput = {
    photoCount: 3,
    hasBeforeAfterMedia: true,
    serviceType: "coating",
    paymentPolicyResult: { met: true },
    hasUnresolvedConcerns: false,
  };

  it("correctionRequests なし → met: true", () => {
    const result = evaluateCertificateGate(baseInput);
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(true);
  });

  it("correctionRequests 空配列 → met: true", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      correctionRequests: [],
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(true);
  });

  it("correctionRequests に pending → met: false", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      correctionRequests: [{ status: "pending" }],
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(false);
    expect(cond?.detail).toContain("訂正");
  });

  it("correctionRequests に approved → met: false", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      correctionRequests: [{ status: "approved" }],
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(false);
  });

  it("correctionRequests に applied のみ → met: true", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      correctionRequests: [{ status: "applied" }, { status: "rejected" }],
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(true);
  });

  it("後方互換: noPendingCorrections=false → met: false", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      noPendingCorrections: false,
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(false);
  });

  it("correctionRequests が noPendingCorrections より優先", () => {
    const result = evaluateCertificateGate({
      ...baseInput,
      noPendingCorrections: false,
      correctionRequests: [], // 空 = 訂正なし
    });
    const cond = result.conditions.find((c) => c.condition === "no_pending_corrections");
    expect(cond?.met).toBe(true);
  });
});
