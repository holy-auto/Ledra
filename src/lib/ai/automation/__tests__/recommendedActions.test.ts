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

  it("NEVER_AUTO_ACTIONS is empty (Wall 3 disabled)", () => {
    expect(NEVER_AUTO_ACTIONS.size).toBe(0);
  });

  it("includes all catalog actions in the recommended preset", () => {
    for (const key of AUTOMATION_ACTION_KEYS) {
      expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has(key)).toBe(true);
    }
  });

  it("includes the safe draft/suggestion/annotation actions", () => {
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("certificate.auto_create_draft_record")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("inventory.auto_draft_reorder")).toBe(true);
    expect(RECOMMENDED_AUTOMATION_ACTION_KEYS.has("review.auto_analyze")).toBe(true);
  });
});
