import { describe, it, expect } from "vitest";
import {
  AUTOMATION_ACTION_KEYS,
  AUTOMATION_ACTION_BY_KEY,
  RECOMMENDED_AUTOMATION_ACTION_KEYS,
} from "@/lib/ai/automation/actionCatalog";
import { shouldAutoImportHistoryOnLink } from "@/lib/ai/automation/orchestrator";
import { DEFAULT_AI_AUTOMATION_SETTINGS, type AiAutomationSettings } from "@/lib/ai/automation/policy";

const KEY = "inbound_message.auto_import_history_on_link";

function settings(overrides: Partial<AiAutomationSettings>): AiAutomationSettings {
  return { ...DEFAULT_AI_AUTOMATION_SETTINGS, ...overrides };
}

describe("履歴一括取り込み auto-action (紐づけ時に過去予定を候補化)", () => {
  it("カタログに登録され inbound_message workflow に紐づく", () => {
    expect(AUTOMATION_ACTION_KEYS.has(KEY)).toBe(true);
    expect(AUTOMATION_ACTION_BY_KEY.get(KEY)?.workflow).toBe("inbound_message");
    expect(AUTOMATION_ACTION_BY_KEY.get(KEY)?.defaultEnabled).toBe(false);
  });

  it("候補提示のみで安全なので おまかせ推奨に含まれる", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has(KEY)).toBe(true);
  });

  it("既定 (opt-in なし) では実行しない", () => {
    expect(shouldAutoImportHistoryOnLink(settings({ autoActions: {} }))).toBe(false);
  });

  it("opt-in 済みでも AI 無効なら実行しない", () => {
    expect(shouldAutoImportHistoryOnLink(settings({ enabled: false, autoActions: { [KEY]: true } }))).toBe(false);
  });

  it("AI 有効 + opt-in で実行する", () => {
    expect(shouldAutoImportHistoryOnLink(settings({ enabled: true, autoActions: { [KEY]: true } }))).toBe(true);
  });
});
