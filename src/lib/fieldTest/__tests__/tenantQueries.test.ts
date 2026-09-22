import { describe, it, expect } from "vitest";
import { validateTenantStatusTransition, createApplication } from "../tenantQueries";

// Minimal chainable fake of the supabase insert path used by createApplication:
// .from(...).insert(...).select(...).single() → { data, error }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabaseInsertError(error: { code?: string; message?: string } | null): any {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: error ? null : { id: "x" }, error }),
        }),
      }),
    }),
  };
}

const appRow = {
  recruitment_id: "r1",
  project_id: "p1",
  manufacturer_id: "m1",
  tenant_id: "t1",
  applied_by: "u1",
};

describe("createApplication duplicate handling", () => {
  it("maps a UNIQUE violation (23505) to a typed FT_DUPLICATE_APPLICATION error", async () => {
    const supa = fakeSupabaseInsertError({ code: "23505", message: "duplicate key" });
    await expect(createApplication(supa, appRow)).rejects.toMatchObject({ code: "FT_DUPLICATE_APPLICATION" });
  });

  it("rethrows non-unique DB errors unchanged (not mislabeled as duplicate)", async () => {
    const supa = fakeSupabaseInsertError({ code: "42501", message: "rls denied" });
    await expect(createApplication(supa, appRow)).rejects.toMatchObject({ code: "42501" });
  });
});

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
