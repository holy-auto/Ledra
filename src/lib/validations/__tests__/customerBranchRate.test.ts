import { describe, it, expect } from "vitest";
import { branchUpdateSchema } from "../customerBranch";

const base = { id: "00000000-0000-4000-8000-000000000000", name: "研究学園店" };

describe("customer branch labor_rate_per_hour", () => {
  it("空は null（自社既定を使う）、整数は数値", () => {
    expect(branchUpdateSchema.parse({ ...base, labor_rate_per_hour: "" }).labor_rate_per_hour).toBeNull();
    expect(branchUpdateSchema.parse(base).labor_rate_per_hour).toBeNull();
    expect(branchUpdateSchema.parse({ ...base, labor_rate_per_hour: "8000" }).labor_rate_per_hour).toBe(8000);
  });

  it("不正値は黙って null にせず弾く（既存単価を消さない）", () => {
    for (const v of ["8500.5", "0", "-1", "abc", "2000000"]) {
      expect(branchUpdateSchema.safeParse({ ...base, labor_rate_per_hour: v }).success).toBe(false);
    }
  });
});
