import { describe, it, expect } from "vitest";
import {
  AUTOMATION_ACTION_KEYS,
  NEVER_AUTO_ACTIONS,
  RECOMMENDED_AUTOMATION_ACTION_KEYS,
  AUTOMATION_ACTION_BY_KEY,
  sanitizeAutoActions,
} from "@/lib/ai/automation/actionCatalog";
import { shouldAutoTamperingCheck, shouldAutoFraudScore } from "@/lib/ai/automation/orchestrator";
import { DEFAULT_AI_AUTOMATION_SETTINGS, type AiAutomationSettings } from "@/lib/ai/automation/policy";

const TRUST_KEYS = ["photo.auto_tampering_check", "insurer_case.auto_fraud_score"] as const;

function settings(overrides: Partial<AiAutomationSettings>): AiAutomationSettings {
  return { ...DEFAULT_AI_AUTOMATION_SETTINGS, ...overrides };
}

describe("信頼系 auto-actions (改ざんスクリーニング / 不正スコア)", () => {
  it("カタログに登録され、壁3 ではない", () => {
    for (const k of TRUST_KEYS) {
      expect(AUTOMATION_ACTION_KEYS.has(k)).toBe(true);
      expect(NEVER_AUTO_ACTIONS.has(k)).toBe(false);
    }
  });

  it("正しい workflow に紐づく", () => {
    expect(AUTOMATION_ACTION_BY_KEY.get("photo.auto_tampering_check")?.workflow).toBe("certificate");
    expect(AUTOMATION_ACTION_BY_KEY.get("insurer_case.auto_fraud_score")?.workflow).toBe("insurer_case");
  });

  it("注釈生成のみなので おまかせ推奨に含まれる", () => {
    for (const k of TRUST_KEYS) {
      expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has(k)).toBe(true);
    }
  });

  it("既定 (opt-in なし) では自動実行しない", () => {
    const s = settings({ autoActions: {} });
    expect(shouldAutoTamperingCheck(s)).toBe(false);
    expect(shouldAutoFraudScore(s)).toBe(false);
  });

  it("opt-in 済みなら自動実行する", () => {
    const s = settings({
      autoActions: { "photo.auto_tampering_check": true, "insurer_case.auto_fraud_score": true },
    });
    expect(shouldAutoTamperingCheck(s)).toBe(true);
    expect(shouldAutoFraudScore(s)).toBe(true);
  });

  it("master switch / コストキャップで enabled=false なら opt-in 済みでも止まる", () => {
    const s = settings({
      enabled: false,
      autoActions: { "photo.auto_tampering_check": true, "insurer_case.auto_fraud_score": true },
    });
    expect(shouldAutoTamperingCheck(s)).toBe(false);
    expect(shouldAutoFraudScore(s)).toBe(false);
  });

  it("sanitizeAutoActions は true の信頼系キーを保持する", () => {
    const out = sanitizeAutoActions({
      "photo.auto_tampering_check": true,
      "insurer_case.auto_fraud_score": true,
    });
    expect(out["photo.auto_tampering_check"]).toBe(true);
    expect(out["insurer_case.auto_fraud_score"]).toBe(true);
  });
});
