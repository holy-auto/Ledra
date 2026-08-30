import { describe, it, expect } from "vitest";

import {
  evaluateCancel,
  evaluateNoShow,
  evaluatePause,
  evaluateResume,
  evaluatePartialComplete,
  isExceptionState,
  requiresApproval,
  CANCEL_REASON_CATEGORIES,
  PAUSE_REASON_CATEGORIES,
  NO_SHOW_ACTIONS,
  PARTIAL_COMPLETE_REASONS,
  SCOPE_CHANGE_CATEGORIES,
} from "../jobExceptions";

import { RESERVATION_STATUS_DISPLAY, reservationStatusDisplay } from "../jobStatusDisplay";

// ============================================================
// evaluateCancel
// ============================================================

describe("evaluateCancel", () => {
  it.each([
    "SCHEDULED",
    "CHECKED_IN",
    "IN_PROGRESS",
    "PAUSED",
    "WAITING_REVIEW",
    "WAITING_CUSTOMER",
    "WAITING_PAYMENT",
    "PARTIALLY_COMPLETED",
  ] as const)("%s → CANCELED: valid", (state) => {
    const result = evaluateCancel(state);
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("CANCELED");
  });

  it("VERIFIED → CANCELED: invalid（終端）", () => {
    const result = evaluateCancel("VERIFIED");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("CANCELED → CANCELED: invalid（既に終端）", () => {
    const result = evaluateCancel("CANCELED");
    expect(result.valid).toBe(false);
  });

  it("CERTIFICATE_PROCESSING → CANCELED: invalid", () => {
    const result = evaluateCancel("CERTIFICATE_PROCESSING");
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// evaluateNoShow
// ============================================================

describe("evaluateNoShow", () => {
  it("SCHEDULED → NO_SHOW: valid", () => {
    const result = evaluateNoShow("SCHEDULED");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("NO_SHOW");
  });

  it("CHECKED_IN → NO_SHOW: invalid（入庫済みの案件は来店なしになりえない。JOB_TRANSITIONS 参照）", () => {
    const result = evaluateNoShow("CHECKED_IN");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("IN_PROGRESS → NO_SHOW: invalid（作業開始後）", () => {
    const result = evaluateNoShow("IN_PROGRESS");
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("CANCELED → NO_SHOW: invalid", () => {
    const result = evaluateNoShow("CANCELED");
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// evaluatePause
// ============================================================

describe("evaluatePause", () => {
  it("IN_PROGRESS → PAUSED: valid", () => {
    const result = evaluatePause("IN_PROGRESS");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("PAUSED");
  });

  it("SCHEDULED → PAUSED: invalid（作業前）", () => {
    const result = evaluatePause("SCHEDULED");
    expect(result.valid).toBe(false);
  });

  it("PAUSED → PAUSED: invalid（既に中断中）", () => {
    const result = evaluatePause("PAUSED");
    expect(result.valid).toBe(false);
  });

  it("COMPLETED → PAUSED: invalid", () => {
    const result = evaluatePause("VERIFIED");
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// evaluateResume
// ============================================================

describe("evaluateResume", () => {
  it("PAUSED → IN_PROGRESS: valid（再開）", () => {
    const result = evaluateResume("PAUSED");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("IN_PROGRESS");
  });

  it("NO_SHOW → SCHEDULED: valid（再予約）", () => {
    const result = evaluateResume("NO_SHOW");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("SCHEDULED");
  });

  it("PARTIALLY_COMPLETED → IN_PROGRESS: valid（残作業再開）", () => {
    const result = evaluateResume("PARTIALLY_COMPLETED");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("IN_PROGRESS");
  });

  it("IN_PROGRESS → invalid（中断状態ではない）", () => {
    const result = evaluateResume("IN_PROGRESS");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("中断");
  });

  it("SCHEDULED → invalid（再開対象ではない）", () => {
    const result = evaluateResume("SCHEDULED");
    expect(result.valid).toBe(false);
  });

  it("CANCELED → invalid（終端）", () => {
    const result = evaluateResume("CANCELED");
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// evaluatePartialComplete
// ============================================================

describe("evaluatePartialComplete", () => {
  it("IN_PROGRESS → PARTIALLY_COMPLETED: valid", () => {
    const result = evaluatePartialComplete("IN_PROGRESS");
    expect(result.valid).toBe(true);
    expect(result.newState).toBe("PARTIALLY_COMPLETED");
  });

  it("SCHEDULED → PARTIALLY_COMPLETED: invalid（作業前）", () => {
    const result = evaluatePartialComplete("SCHEDULED");
    expect(result.valid).toBe(false);
  });

  it("PAUSED → PARTIALLY_COMPLETED: invalid（先に再開が必要）", () => {
    const result = evaluatePartialComplete("PAUSED");
    expect(result.valid).toBe(false);
  });

  it("VERIFIED → PARTIALLY_COMPLETED: invalid（終端）", () => {
    const result = evaluatePartialComplete("VERIFIED");
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// isExceptionState
// ============================================================

describe("isExceptionState", () => {
  it.each(["CANCELED", "NO_SHOW", "PAUSED", "PARTIALLY_COMPLETED"] as const)("%s → true", (state) => {
    expect(isExceptionState(state)).toBe(true);
  });

  it.each(["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "VERIFIED"] as const)("%s → false", (state) => {
    expect(isExceptionState(state)).toBe(false);
  });
});

// ============================================================
// requiresApproval
// ============================================================

describe("requiresApproval", () => {
  it("正の金額差分 → true（増額は承認必要）", () => {
    expect(requiresApproval(5000)).toBe(true);
  });

  it("0 → false", () => {
    expect(requiresApproval(0)).toBe(false);
  });

  it("負の金額差分 → false（減額は承認不要）", () => {
    expect(requiresApproval(-3000)).toBe(false);
  });

  it("undefined → false", () => {
    expect(requiresApproval(undefined)).toBe(false);
  });
});

// ============================================================
// 定数
// ============================================================

describe("例外フロー定数", () => {
  it("6 つのキャンセル理由カテゴリ", () => {
    expect(CANCEL_REASON_CATEGORIES).toHaveLength(6);
  });

  it("6 つの中断理由カテゴリ", () => {
    expect(PAUSE_REASON_CATEGORIES).toHaveLength(6);
  });

  it("3 つの No-Show 後アクション", () => {
    expect(NO_SHOW_ACTIONS).toHaveLength(3);
  });

  it("5 つの部分終了理由", () => {
    expect(PARTIAL_COMPLETE_REASONS).toHaveLength(5);
  });

  it("5 つのスコープ変更カテゴリ", () => {
    expect(SCOPE_CHANGE_CATEGORIES).toHaveLength(5);
  });
});

// ============================================================
// jobStatusDisplay — IMP-031 追加分
// ============================================================

describe("jobStatusDisplay: IMP-031 例外状態", () => {
  it("paused の表示構成がある", () => {
    const d = RESERVATION_STATUS_DISPLAY.paused;
    expect(d.label).toBe("中断中");
    expect(d.variant).toBe("warning");
  });

  it("no_show の表示構成がある", () => {
    const d = RESERVATION_STATUS_DISPLAY.no_show;
    expect(d.label).toBe("来店なし");
    expect(d.variant).toBe("danger");
  });

  it("partially_completed の表示構成がある", () => {
    const d = RESERVATION_STATUS_DISPLAY.partially_completed;
    expect(d.label).toBe("部分終了");
    expect(d.variant).toBe("info");
  });

  it("全 8 ステータスの表示構成が揃っている", () => {
    expect(Object.keys(RESERVATION_STATUS_DISPLAY)).toHaveLength(8);
  });

  it("reservationStatusDisplay() で新ステータスが取得できる", () => {
    expect(reservationStatusDisplay("paused").label).toBe("中断中");
    expect(reservationStatusDisplay("no_show").label).toBe("来店なし");
    expect(reservationStatusDisplay("partially_completed").label).toBe("部分終了");
  });
});
