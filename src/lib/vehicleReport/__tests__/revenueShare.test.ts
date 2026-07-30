import { describe, it, expect } from "vitest";
import { splitRevenueByRecordCount } from "../revenueShare";

describe("splitRevenueByRecordCount", () => {
  it("returns 70% pool and splits proportionally by record count", () => {
    // ¥3,000 sale, 70% merchants → pool ¥2,100. Records 3:1 → 1575 : 525.
    const { pool, totalCertCount, shares } = splitRevenueByRecordCount(3000, 7000, [
      { tenantId: "a", certCount: 3 },
      { tenantId: "b", certCount: 1 },
    ]);
    expect(pool).toBe(2100);
    expect(totalCertCount).toBe(4);
    expect(shares.find((s) => s.tenantId === "a")?.amount).toBe(1575);
    expect(shares.find((s) => s.tenantId === "b")?.amount).toBe(525);
    // (a) sum of shares exactly equals the pool — no yen lost.
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(pool);
  });

  it("hands the rounding remainder to the largest contributor first", () => {
    // pool 2100, weights 2:1:1 → floors 1050,525,525 = 2100 (no remainder).
    // Use weights that DO leave a remainder: 1:1:1 of pool 2100 → 700 each,
    // sums to 2100. Force a remainder with pool 100, weights 1:1:1 →
    // floor(100/3)=33 each = 99, remainder 1 → goes to first by tie-break.
    const { pool, shares } = splitRevenueByRecordCount(1000, 1000, [
      { tenantId: "c", certCount: 1 },
      { tenantId: "a", certCount: 1 },
      { tenantId: "b", certCount: 1 },
    ]);
    expect(pool).toBe(100);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(100);
    // Equal weights → deterministic tenantId asc tie-break gives the extra
    // yen to "a".
    expect(shares.find((s) => s.tenantId === "a")?.amount).toBe(34);
    expect(shares.find((s) => s.tenantId === "b")?.amount).toBe(33);
    expect(shares.find((s) => s.tenantId === "c")?.amount).toBe(33);
  });

  it("gives remainder to the higher record count over the tie-break", () => {
    // pool 100, weights 5:4:1 → floors 50,40,10 = 100, remainder 0.
    // weights 2:2:1 of pool 101 → floor 40,40,20 = 100, remainder 1 →
    // largest count wins; both top are 2, tenantId asc → "a".
    const { shares } = splitRevenueByRecordCount(1010, 1000, [
      { tenantId: "b", certCount: 2 },
      { tenantId: "a", certCount: 2 },
      { tenantId: "c", certCount: 1 },
    ]);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(101);
    expect(shares.find((s) => s.tenantId === "a")?.amount).toBe(41);
    expect(shares.find((s) => s.tenantId === "b")?.amount).toBe(40);
    expect(shares.find((s) => s.tenantId === "c")?.amount).toBe(20);
  });

  it("ignores tenants with zero records and returns empty when none qualify", () => {
    const empty = splitRevenueByRecordCount(3000, 7000, [{ tenantId: "a", certCount: 0 }]);
    expect(empty.shares).toEqual([]);
    expect(empty.pool).toBe(0);
    expect(empty.totalCertCount).toBe(0);

    const mixed = splitRevenueByRecordCount(3000, 7000, [
      { tenantId: "a", certCount: 2 },
      { tenantId: "b", certCount: 0 },
    ]);
    expect(mixed.shares).toHaveLength(1);
    expect(mixed.shares[0]).toMatchObject({ tenantId: "a", amount: 2100 });
  });

  it("returns an empty split for a zero-amount sale", () => {
    const { shares, pool } = splitRevenueByRecordCount(0, 7000, [{ tenantId: "a", certCount: 3 }]);
    expect(shares).toEqual([]);
    expect(pool).toBe(0);
  });
});
