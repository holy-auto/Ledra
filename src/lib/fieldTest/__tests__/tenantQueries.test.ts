import { describe, it, expect } from "vitest";
import { validateTenantStatusTransition, createApplication, conditionCheckInputSchema } from "../tenantQueries";

// Minimal chainable fake covering both paths createApplication uses:
//   insert(...).select(...).single()            → { data|null, error }
//   update(...).eq().eq().in().select().maybeSingle() → { data:reviveData|null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupa(opts: { insertError?: { code?: string; message?: string } | null; reviveData?: unknown }): any {
  const insertError = opts.insertError ?? null;
  const obj: Record<string, unknown> = {};
  for (const m of ["from", "insert", "update", "select", "eq", "in"]) obj[m] = () => obj;
  obj.single = async () => ({ data: insertError ? null : { id: "new", status: "pending" }, error: insertError });
  obj.maybeSingle = async () => ({ data: opts.reviveData ?? null, error: null });
  return obj;
}

const appRow = {
  recruitment_id: "r1",
  project_id: "p1",
  manufacturer_id: "m1",
  tenant_id: "t1",
  applied_by: "u1",
};

describe("createApplication re-apply / duplicate handling", () => {
  it("inserts a fresh application when there is no conflict", async () => {
    const supa = fakeSupa({ insertError: null });
    await expect(createApplication(supa, appRow)).resolves.toMatchObject({ id: "new" });
  });

  it("revives a withdrawn/rejected application on re-apply (23505 → update finds a revivable row)", async () => {
    const supa = fakeSupa({ insertError: { code: "23505" }, reviveData: { id: "revived", status: "pending" } });
    await expect(createApplication(supa, appRow)).resolves.toMatchObject({ id: "revived" });
  });

  it("blocks a genuine active duplicate (23505 → no revivable row) with a typed error", async () => {
    const supa = fakeSupa({ insertError: { code: "23505" }, reviveData: null });
    await expect(createApplication(supa, appRow)).rejects.toMatchObject({ code: "FT_DUPLICATE_APPLICATION" });
  });

  it("rethrows non-unique DB errors unchanged (not mislabeled as duplicate)", async () => {
    const supa = fakeSupa({ insertError: { code: "42501", message: "rls denied" } });
    await expect(createApplication(supa, appRow)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("conditionCheckInputSchema（信頼境界の入力検証）", () => {
  const j = "11111111-1111-4111-8111-111111111111";
  const c = "22222222-2222-4222-8222-222222222222";

  it("正しい入力を通す（value_* は省略可）", () => {
    expect(conditionCheckInputSchema.safeParse({ job_id: j, condition_id: c }).success).toBe(true);
    expect(
      conditionCheckInputSchema.safeParse({ job_id: j, condition_id: c, value_numeric: 3.5, value_boolean: true })
        .success,
    ).toBe(true);
  });

  it("job_id / condition_id が UUID でなければ弾く（旧: 生値のまま DB へ）", () => {
    expect(conditionCheckInputSchema.safeParse({ job_id: "not-a-uuid", condition_id: c }).success).toBe(false);
    expect(conditionCheckInputSchema.safeParse({ condition_id: c }).success).toBe(false);
  });

  it("value_numeric に文字列が来たら弾く（旧: Postgres まで届いて不透明な 500）", () => {
    expect(conditionCheckInputSchema.safeParse({ job_id: j, condition_id: c, value_numeric: "abc" }).success).toBe(
      false,
    );
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
