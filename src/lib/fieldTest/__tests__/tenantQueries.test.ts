import { describe, it, expect } from "vitest";
import { validateTenantStatusTransition } from "../tenantQueries";

describe("validateTenantStatusTransition", () => {
  it("assigned → in_progress は許可", () => {
    expect(validateTenantStatusTransition("assigned", "in_progress")).toBeNull();
  });

  it("in_progress → evidence_submitted は許可", () => {
    expect(validateTenantStatusTransition("in_progress", "evidence_submitted")).toBeNull();
  });

  it("assigned → evidence_submitted は拒否", () => {
    const err = validateTenantStatusTransition("assigned", "evidence_submitted");
    expect(err).not.toBeNull();
    expect(err).toContain("assigned");
    expect(err).toContain("evidence_submitted");
  });

  it("in_progress → completed は拒否（メーカー専用）", () => {
    const err = validateTenantStatusTransition("in_progress", "completed");
    expect(err).not.toBeNull();
  });

  it("evidence_submitted → inspection は拒否（メーカー専用）", () => {
    const err = validateTenantStatusTransition("evidence_submitted", "inspection");
    expect(err).not.toBeNull();
  });

  it("completed → assigned は拒否（逆戻り不可）", () => {
    const err = validateTenantStatusTransition("completed", "assigned");
    expect(err).not.toBeNull();
  });

  it("unknown → in_progress は拒否", () => {
    const err = validateTenantStatusTransition("unknown", "in_progress");
    expect(err).not.toBeNull();
  });

  it("assigned → assigned は拒否（同一ステータス）", () => {
    const err = validateTenantStatusTransition("assigned", "assigned");
    expect(err).not.toBeNull();
  });
});
