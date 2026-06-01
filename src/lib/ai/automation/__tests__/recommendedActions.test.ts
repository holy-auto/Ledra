import { describe, it, expect } from "vitest";
import {
  RECOMMENDED_AUTOMATION_ACTION_KEYS,
  AUTOMATION_ACTION_KEYS,
  NEVER_AUTO_ACTIONS,
} from "@/lib/ai/automation/actionCatalog";

describe("RECOMMENDED_AUTOMATION_ACTION_KEYS (おまかせ運用)", () => {
  it("is non-empty", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.size).toBeGreaterThan(0);
  });

  it("only contains valid catalog action keys", () => {
    for (const key of RECOMMENDED_AUTOMATION_ACTION_KEYS) {
      expect(AUTOMATION_ACTION_KEYS.has(key)).toBe(true);
    }
  });

  it("never includes a 壁3 (NEVER_AUTO) action", () => {
    for (const key of RECOMMENDED_AUTOMATION_ACTION_KEYS) {
      expect(NEVER_AUTO_ACTIONS.has(key)).toBe(false);
    }
  });

  it("excludes outbound-send and auto-create actions (deliberate opt-in only)", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("invoice.auto_send_on_confirm")).toBe(false);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("quote.auto_send_on_confirm")).toBe(false);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("inbound_message.auto_create_reservation")).toBe(false);
  });

  it("includes the safe draft/suggestion/annotation actions", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("certificate.auto_create_draft_record")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("inventory.auto_draft_reorder")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("review.auto_analyze")).toBe(true);
  });
});
