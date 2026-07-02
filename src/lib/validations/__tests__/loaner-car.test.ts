import { describe, it, expect } from "vitest";
import { loanerLoanCreateSchema } from "../loaner-car";

const CAR = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";

describe("loanerLoanCreateSchema — body_repair_job_id", () => {
  it("鈑金案件 ID を受理する", () => {
    const r = loanerLoanCreateSchema.safeParse({ loaner_car_id: CAR, body_repair_job_id: JOB });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body_repair_job_id).toBe(JOB);
  });

  it("空文字 / 未指定は null に正規化される", () => {
    const empty = loanerLoanCreateSchema.safeParse({ loaner_car_id: CAR, body_repair_job_id: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.body_repair_job_id).toBeNull();

    const omitted = loanerLoanCreateSchema.safeParse({ loaner_car_id: CAR });
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.body_repair_job_id).toBeNull();
  });

  it("不正な UUID の鈑金案件 ID を弾く", () => {
    const r = loanerLoanCreateSchema.safeParse({ loaner_car_id: CAR, body_repair_job_id: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});
