import { describe, it, expect } from "vitest";
import {
  createStructuredError,
  structuredErrors,
  requiresImmediateAttention,
  toSentryContext,
  toClientPayload,
  type StructuredError,
  type DataSafetyLevel,
  type RecoveryAction,
} from "../errorContract";

// ── createStructuredError ──

describe("createStructuredError", () => {
  it("最小入力でデフォルト値が埋まる", () => {
    const err = createStructuredError({
      category: "validation",
      code: "bad_input",
      message: "入力エラー",
    });
    expect(err.category).toBe("validation");
    expect(err.code).toBe("bad_input");
    expect(err.message).toBe("入力エラー");
    expect(err.dataSafety).toBe("safe");
    expect(err.retry.retryable).toBe(false);
    expect(err.recovery).toEqual([{ kind: "none", label: "対応不要" }]);
    expect(err.detail).toBeUndefined();
    expect(err.context).toBeUndefined();
    expect(err.source).toBeUndefined();
  });

  it("全フィールド指定で上書きされる", () => {
    const err = createStructuredError({
      category: "external_service",
      code: "stripe_timeout",
      message: "Stripe タイムアウト",
      detail: "POST /v1/charges 30s",
      dataSafety: "unknown",
      retry: { retryable: true, maxAttempts: 3, backoff: "exponential", baseDelaySeconds: 2 },
      recovery: [{ kind: "retry_after", label: "30秒後に再試行", retryAfterSeconds: 30 }],
      context: { chargeId: "ch_xxx" },
      source: "/api/admin/payments",
    });
    expect(err.dataSafety).toBe("unknown");
    expect(err.retry).toEqual({ retryable: true, maxAttempts: 3, backoff: "exponential", baseDelaySeconds: 2 });
    expect(err.recovery[0].retryAfterSeconds).toBe(30);
    expect(err.context).toEqual({ chargeId: "ch_xxx" });
    expect(err.source).toBe("/api/admin/payments");
  });

  it("retry の部分指定が可能", () => {
    const err = createStructuredError({
      category: "timeout",
      code: "timeout",
      message: "タイムアウト",
      retry: { retryable: true },
    });
    expect(err.retry.retryable).toBe(true);
    expect(err.retry.maxAttempts).toBeUndefined();
    expect(err.retry.backoff).toBeUndefined();
  });

  it("context / recovery は参照ではなくコピーされる（呼び出し元の後続変更が波及しない）", () => {
    const context: Record<string, unknown> = { step: 1 };
    const recovery: RecoveryAction[] = [{ kind: "retry", label: "再試行" }];
    const err = createStructuredError({
      category: "unknown",
      code: "test",
      message: "test",
      context,
      recovery,
    });
    context.step = 2;
    recovery.push({ kind: "refresh", label: "リフレッシュ" });
    expect(err.context).toEqual({ step: 1 });
    expect(err.recovery).toEqual([{ kind: "retry", label: "再試行" }]);
  });
});

// ── structuredErrors プリセット ──

describe("structuredErrors プリセット", () => {
  it("validation: safe + retryable=false", () => {
    const err = structuredErrors.validation("メールアドレスが不正です");
    expect(err.category).toBe("validation");
    expect(err.code).toBe("validation_error");
    expect(err.dataSafety).toBe("safe");
    expect(err.retry.retryable).toBe(false);
    expect(err.recovery.length).toBeGreaterThan(0);
  });

  it("validation: カスタムコード指定", () => {
    const err = structuredErrors.validation("VIN 形式不正", { code: "invalid_vin" });
    expect(err.code).toBe("invalid_vin");
  });

  it("externalService: unknown + retryable + exponential", () => {
    const err = structuredErrors.externalService("stripe", "決済サービスに接続できません");
    expect(err.category).toBe("external_service");
    expect(err.code).toBe("external_stripe_error");
    expect(err.dataSafety).toBe("unknown");
    expect(err.retry.retryable).toBe(true);
    expect(err.retry.backoff).toBe("exponential");
    expect(err.retry.maxAttempts).toBe(3);
    expect(err.context).toEqual({ service: "stripe" });
  });

  it("externalService: dataSafety を上書き可能", () => {
    const err = structuredErrors.externalService("supabase", "DB エラー", { dataSafety: "partial" });
    expect(err.dataSafety).toBe("partial");
  });

  it("externalService: retryAfterSeconds(ユーザー向け表示)と baseDelaySeconds(自動再試行の間隔)は独立している", () => {
    // retryAfterSeconds だけを指定しても、システムの自動バックオフ間隔(baseDelaySeconds)は
    // デフォルトの 2 秒のまま変わらない。
    const err = structuredErrors.externalService("stripe", "エラー", { retryAfterSeconds: 60 });
    expect(err.retry.baseDelaySeconds).toBe(2);
    expect(err.recovery.find((r) => r.kind === "retry_after")?.retryAfterSeconds).toBe(60);
  });

  it("stateTransition: safe + 遷移情報がコンテキストに含まれる", () => {
    const err = structuredErrors.stateTransition("SCHEDULED", "COMPLETED", "予約");
    expect(err.category).toBe("state_transition");
    expect(err.code).toBe("invalid_state_transition");
    expect(err.message).toContain("SCHEDULED");
    expect(err.message).toContain("COMPLETED");
    expect(err.dataSafety).toBe("safe");
    expect(err.retry.retryable).toBe(false);
    expect(err.context).toEqual({ entity: "予約", from: "SCHEDULED", to: "COMPLETED" });
  });

  it("dataIntegrity: partial + manual_check", () => {
    const err = structuredErrors.dataIntegrity("証明書と予約のリンク不整合");
    expect(err.category).toBe("data_integrity");
    expect(err.dataSafety).toBe("partial");
    expect(err.retry.retryable).toBe(false);
    expect(err.recovery.some((r) => r.kind === "manual_check")).toBe(true);
  });

  it("dataIntegrity: targetPath が recovery に渡される", () => {
    const err = structuredErrors.dataIntegrity("不整合", { targetPath: "/admin/certificates" });
    const check = err.recovery.find((r) => r.kind === "manual_check");
    expect(check?.targetPath).toBe("/admin/certificates");
  });

  it("timeout: unknown + retryable", () => {
    const err = structuredErrors.timeout("証明書 PDF 生成");
    expect(err.category).toBe("timeout");
    expect(err.dataSafety).toBe("unknown");
    expect(err.retry.retryable).toBe(true);
    expect(err.message).toContain("証明書 PDF 生成");
    expect(err.context).toEqual({ operation: "証明書 PDF 生成" });
  });

  it("concurrency: safe + retryable(1回) + refresh", () => {
    const err = structuredErrors.concurrency("別のユーザーが同じレコードを更新しました");
    expect(err.category).toBe("concurrency");
    expect(err.dataSafety).toBe("safe");
    expect(err.retry.retryable).toBe(true);
    expect(err.retry.maxAttempts).toBe(1);
    expect(err.recovery[0].kind).toBe("refresh");
  });
});

// ── requiresImmediateAttention ──

describe("requiresImmediateAttention", () => {
  const cases: Array<[DataSafetyLevel, boolean]> = [
    ["safe", false],
    ["unknown", false],
    ["partial", true],
    ["compromised", true],
  ];

  it.each(cases)("dataSafety=%s → %s", (level, expected) => {
    const err = createStructuredError({
      category: "unknown",
      code: "test",
      message: "test",
      dataSafety: level,
    });
    expect(requiresImmediateAttention(err)).toBe(expected);
  });
});

// ── toSentryContext ──

describe("toSentryContext", () => {
  it("flat Record に変換される", () => {
    const err = structuredErrors.externalService("stripe", "エラー", { source: "/api/pay" });
    const ctx = toSentryContext(err);
    expect(ctx.category).toBe("external_service");
    expect(ctx.code).toBe("external_stripe_error");
    expect(ctx.data_safety).toBe("unknown");
    expect(ctx.retryable).toBe(true);
    expect(ctx.source).toBe("/api/pay");
    expect(ctx.service).toBe("stripe");
    // recovery_kinds はカンマ区切り
    expect(typeof ctx.recovery_kinds).toBe("string");
  });

  it("context のキーが固定フィールド名と衝突しても固定値が優先される", () => {
    const err = createStructuredError({
      category: "external_service",
      code: "ext_error",
      message: "エラー",
      source: "/api/webhooks/stripe",
      context: { source: "attacker-controlled-value" },
    });
    const ctx = toSentryContext(err);
    expect(ctx.source).toBe("/api/webhooks/stripe");
  });
});

// ── toClientPayload ──

describe("toClientPayload", () => {
  let err: StructuredError;

  it("デフォルトでは detail を含まない", () => {
    err = createStructuredError({
      category: "validation",
      code: "bad",
      message: "入力エラー",
      detail: "内部詳細",
    });
    const payload = toClientPayload(err);
    expect(payload.error).toBe("bad");
    expect(payload.message).toBe("入力エラー");
    expect(payload.detail).toBeUndefined();
    expect(payload.retryable).toBe(false);
    expect(Array.isArray(payload.recovery)).toBe(true);
  });

  it("includeDetail=true で detail が含まれる", () => {
    err = createStructuredError({
      category: "validation",
      code: "bad",
      message: "入力エラー",
      detail: "内部詳細",
    });
    const payload = toClientPayload(err, { includeDetail: true });
    expect(payload.detail).toBe("内部詳細");
  });

  it("recovery の retryAfterSeconds が含まれる", () => {
    err = structuredErrors.externalService("stripe", "エラー");
    const payload = toClientPayload(err);
    const retryRecovery = payload.recovery.find((r) => r.kind === "retry_after");
    expect(retryRecovery?.retryAfterSeconds).toBeDefined();
  });

  it("recovery に targetPath は含まれない（クライアントペイロード）", () => {
    err = structuredErrors.dataIntegrity("不整合", { targetPath: "/admin/x" });
    const payload = toClientPayload(err);
    // toClientPayload は kind + label + retryAfterSeconds のみ
    const check = payload.recovery.find((r) => r.kind === "manual_check");
    expect(check).toBeDefined();
    expect("targetPath" in (check ?? {})).toBe(false);
  });
});
