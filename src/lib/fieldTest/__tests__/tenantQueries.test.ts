import { describe, it, expect } from "vitest";
import {
  validateTenantStatusTransition,
  createApplication,
  conditionCheckInputSchema,
  upsertConditionCheck,
  updateTenantFtJobStatus,
  isRecruitmentExpired,
  applicationInputSchema,
} from "../tenantQueries";

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

describe("upsertConditionCheck の condition 越境ガード（/code-review #1123）", () => {
  // ft_conditions 照会（maybeSingle）→ ft_condition_checks upsert（single）を賄う最小モック。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fakeSupa(condFound: boolean): any {
    const obj: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "upsert"]) obj[m] = () => obj;
    obj.maybeSingle = async () => ({ data: condFound ? { id: "cond1" } : null, error: null });
    obj.single = async () => ({ data: { id: "check1", condition_id: "cond1" }, error: null });
    return obj;
  }
  const val = { value_boolean: true };

  it("条件が案件のプロジェクトに無ければ FT_INVALID_CONDITION を投げる（実在しない/越境の両方）", async () => {
    await expect(upsertConditionCheck(fakeSupa(false), "job1", "proj1", "condX", val, "user1")).rejects.toMatchObject({
      code: "FT_INVALID_CONDITION",
    });
  });

  it("条件がプロジェクトに属していれば記録する", async () => {
    await expect(upsertConditionCheck(fakeSupa(true), "job1", "proj1", "cond1", val, "user1")).resolves.toMatchObject({
      id: "check1",
    });
  });
});

describe("状態ガード付き UPDATE の 0 行 → FT_STATE_CONFLICT（500 にしない・#1117）", () => {
  // .from().update().eq().eq().select().maybeSingle() を賄い、maybeSingle は 0 行を表す null を返す。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fakeSupaNoRow(): any {
    const obj: Record<string, unknown> = {};
    for (const m of ["from", "update", "select", "eq", "in"]) obj[m] = () => obj;
    obj.maybeSingle = async () => ({ data: null, error: null });
    return obj;
  }

  it("updateTenantFtJobStatus: 期待状態で0行（競合/不存在）と型付き 4xx で投げる", async () => {
    // expectedStatus ガードにより、現在状態が変わっていれば 0 行 → FT_STATE_CONFLICT。
    await expect(
      updateTenantFtJobStatus(fakeSupaNoRow(), "t1", "job1", "assigned", "evidence_submitted"),
    ).rejects.toMatchObject({ code: "FT_STATE_CONFLICT" });
  });
});

describe("isRecruitmentExpired（応募の締切ガード・#1117）", () => {
  const now = new Date("2026-09-23T00:00:00Z");
  it("締切が過去なら true", () => {
    expect(isRecruitmentExpired("2026-09-22T23:59:59Z", now)).toBe(true);
  });
  it("締切が未来なら false", () => {
    expect(isRecruitmentExpired("2026-09-24T00:00:00Z", now)).toBe(false);
  });
  it("締切なし（null/undefined）は無期限＝false", () => {
    expect(isRecruitmentExpired(null, now)).toBe(false);
    expect(isRecruitmentExpired(undefined, now)).toBe(false);
  });
  it("不正な日付文字列は false（誤って締切扱いしない）", () => {
    expect(isRecruitmentExpired("not-a-date", now)).toBe(false);
  });
});

describe("applicationInputSchema（応募入力の信頼境界・#1117）", () => {
  const rid = "11111111-1111-4111-8111-111111111111";
  it("recruitment_id は UUID 必須、notes は任意", () => {
    expect(applicationInputSchema.safeParse({ recruitment_id: rid }).success).toBe(true);
    expect(applicationInputSchema.safeParse({ recruitment_id: "x" }).success).toBe(false);
  });
  it("notes は 2000 文字まで（過大行を防ぐ）", () => {
    expect(applicationInputSchema.safeParse({ recruitment_id: rid, notes: "a".repeat(2000) }).success).toBe(true);
    expect(applicationInputSchema.safeParse({ recruitment_id: rid, notes: "a".repeat(2001) }).success).toBe(false);
  });
  it("notes: null も受け付ける（旧実装の挙動維持・nullish）", () => {
    expect(applicationInputSchema.safeParse({ recruitment_id: rid, notes: null }).success).toBe(true);
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
