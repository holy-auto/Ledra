import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_STATES,
  DOCUMENT_CORRECTION_STATES,
  JOB_STATES,
  PART_INSTALLATION_STATES,
  PAYMENT_STATES,
  SEVERITIES,
  STEP_STATES,
  SYNC_STATES,
  isCertificateState,
  isDocumentCorrectionState,
  isJobState,
  isPartInstallationState,
  isPaymentState,
  isSeverity,
  isStepState,
  isSyncState,
} from "../states";
import {
  DOMAIN_LOCALES,
  __DOMAIN_LABEL_MAPS,
  certificateStateLabel,
  jobStateLabel,
  partInstallationStateLabel,
  paymentStateLabel,
  severityLabel,
  stepStateLabel,
  syncStateLabel,
} from "../labels";

const AXES = [
  { name: "job", values: JOB_STATES, guard: isJobState, expected: 12 },
  { name: "step", values: STEP_STATES, guard: isStepState, expected: 8 },
  { name: "severity", values: SEVERITIES, guard: isSeverity, expected: 5 },
  { name: "certificate", values: CERTIFICATE_STATES, guard: isCertificateState, expected: 8 },
  { name: "payment", values: PAYMENT_STATES, guard: isPaymentState, expected: 9 },
  { name: "sync", values: SYNC_STATES, guard: isSyncState, expected: 5 },
  { name: "partInstallation", values: PART_INSTALLATION_STATES, guard: isPartInstallationState, expected: 5 },
  { name: "documentCorrection", values: DOCUMENT_CORRECTION_STATES, guard: isDocumentCorrectionState, expected: 4 },
] as const;

describe("正準語彙の値集合(v2.0 Appendix A)", () => {
  it.each(AXES)("$name 軸は仕様どおりの値数で重複がない", ({ values, expected }) => {
    expect(values).toHaveLength(expected);
    expect(new Set(values).size).toBe(expected);
  });

  it("UNKNOWN は PaymentState にのみ存在する(結果不明 ≠ 失敗の不変条件)", () => {
    expect(isPaymentState("UNKNOWN")).toBe(true);
    expect(PAYMENT_STATES).not.toContain("FAILED");
  });
});

describe("型ガード(不正値の扱い)", () => {
  it.each(AXES)("$name: 正準値をすべて受理する", ({ values, guard }) => {
    for (const v of values) expect(guard(v)).toBe(true);
  });

  it.each(AXES)("$name: 非文字列・未知値を拒否する", ({ guard }) => {
    for (const bad of [null, undefined, 0, {}, "", "nope", "verified "]) {
      expect(guard(bad)).toBe(false);
    }
  });

  it("既存実装の小文字語彙(reservations.status 等)は正準値として受理しない", () => {
    // 正準語彙と稼働語彙の黙った同一視を防ぐ(docs/implementation/requirement-trace.md §0.2)
    for (const legacy of ["confirmed", "arrived", "in_progress", "completed", "cancelled"]) {
      expect(isJobState(legacy)).toBe(false);
    }
    for (const legacy of ["active", "void", "draft", "expired"]) {
      expect(isCertificateState(legacy)).toBe(false);
    }
    for (const legacy of ["unpaid", "paid", "partial", "refunded", "partial_refund", "voided"]) {
      expect(isPaymentState(legacy)).toBe(false);
    }
  });

  it("part_installations の小文字 DB 値は正準値として受理しない", () => {
    for (const dbVal of ["draft", "installed", "customer_verified", "disputed", "voided"]) {
      expect(isPartInstallationState(dbVal)).toBe(false);
    }
  });
});

// PartInstallation / DocumentCorrection の遷移表テストは transitions.test.ts（他の軸と同じ場所）に移設。

describe("ロケール別ラベル", () => {
  it.each(AXES)("$name: 収録ロケールのマップは全正準値を網羅し空文字がない", ({ name, values }) => {
    const maps = __DOMAIN_LABEL_MAPS[name];
    for (const [locale, map] of Object.entries(maps)) {
      expect(Object.keys(map).sort(), `${name}/${locale}`).toEqual([...values].sort());
      for (const v of values) expect(map[v as keyof typeof map], `${name}/${locale}/${v}`).toBeTruthy();
    }
  });

  it("ja ラベルは v2.0 Appendix A の表記に一致する(代表値)", () => {
    expect(jobStateLabel("CHECKED_IN")).toBe("入庫済み");
    expect(jobStateLabel("VERIFIED")).toBe("完了 / VERIFIED");
    expect(severityLabel("ACTION")).toBe("要対応");
    expect(certificateStateLabel("SUPERSEDED")).toBe("新しい版あり");
    expect(paymentStateLabel("UNKNOWN")).toBe("結果不明");
  });

  it("ロケール指定でラベルが切り替わり、ドメインコードは変わらない", () => {
    expect(jobStateLabel("SCHEDULED", "en")).toBe("Scheduled");
    expect(syncStateLabel("CONFLICT", "en")).toBe("Conflict");
    expect(stepStateLabel("WAITING_APPROVAL", "en")).toBe("Awaiting approval");
  });

  it("型を欺いて非正準値が渡された場合は undefined ではなくコードをそのまま返す", () => {
    expect(jobStateLabel("confirmed" as never)).toBe("confirmed");
    expect(paymentStateLabel("paid" as never, "en")).toBe("paid");
  });

  it("6言語すべてでラベルが解決可能(IMP-011 で全ロケール収録)", () => {
    for (const locale of DOMAIN_LOCALES) {
      expect(jobStateLabel("SCHEDULED", locale)).toBeTruthy();
    }
    // vi/hi は IMP-011 でラベル収録済み — ja フォールバックではなく各言語の訳語を返す
    expect(jobStateLabel("SCHEDULED", "vi")).toBe("Đã lên lịch");
    expect(paymentStateLabel("PAID", "hi")).toBe("भुगतान पूर्ण");
    expect(stepStateLabel("COMPLETED", "id")).toBe("Selesai");
    expect(severityLabel("CRITICAL", "fil")).toBe("Kritikal");
  });

  it("PartInstallation ラベル — ja は既存 UI 表記と一致", () => {
    expect(partInstallationStateLabel("DRAFT")).toBe("下書き");
    expect(partInstallationStateLabel("INSTALLED")).toBe("装着済み（未確定）");
    expect(partInstallationStateLabel("CUSTOMER_VERIFIED")).toBe("確定済み（完全凍結）");
    expect(partInstallationStateLabel("DISPUTED")).toBe("係争中");
    expect(partInstallationStateLabel("VOIDED")).toBe("取消済み");
  });

  it("PartInstallation ラベル — en", () => {
    expect(partInstallationStateLabel("INSTALLED", "en")).toBe("Installed (unconfirmed)");
    expect(partInstallationStateLabel("CUSTOMER_VERIFIED", "en")).toBe("Verified (frozen)");
  });

  it("PartInstallation ラベル — 6言語すべてで解決可能", () => {
    for (const locale of DOMAIN_LOCALES) {
      expect(partInstallationStateLabel("INSTALLED", locale)).toBeTruthy();
    }
  });
});
