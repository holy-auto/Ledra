import { describe, it, expect, vi } from "vitest";
import { approvedTenants, hasApprovedApplication, isParticipatingTenant } from "../applicationGate";

/** ft_applications への eq 条件を記録し、limit で結果を返すだけの最小モック。 */
function mockAdmin(result: { data: unknown[] | null; error: unknown }) {
  const eqs: [string, unknown][] = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, v: unknown) => {
      eqs.push([col, v]);
      return chain;
    }),
    limit: vi.fn(async () => result),
  };
  const from = vi.fn(() => chain);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from } as any, from, eqs };
}

const P = { manufacturerId: "m1", projectId: "p1", tenantId: "t1" };

describe("hasApprovedApplication", () => {
  it("メーカー・プロジェクト・施工店・approved で絞り込む", async () => {
    const { admin, from, eqs } = mockAdmin({ data: [{ id: "a1" }], error: null });
    expect(await hasApprovedApplication(admin, P)).toBe(true);
    expect(from).toHaveBeenCalledWith("ft_applications");
    expect(eqs).toEqual([
      ["manufacturer_id", "m1"],
      ["project_id", "p1"],
      ["tenant_id", "t1"],
      ["status", "approved"],
    ]);
  });

  it("承認済みの応募が無ければ false", async () => {
    const { admin } = mockAdmin({ data: [], error: null });
    expect(await hasApprovedApplication(admin, P)).toBe(false);
  });

  it("問い合わせが失敗したら投げる（黙って通さない）", async () => {
    const { admin } = mockAdmin({ data: null, error: new Error("db down") });
    await expect(hasApprovedApplication(admin, P)).rejects.toThrow("db down");
  });
});

describe("approvedTenants", () => {
  it("approved だけを、施工店ごとに1件で返す（同じ施工店が複数の募集に応募していても重複しない）", () => {
    const rows = [
      { tenant_id: "t1", status: "approved", tenants: { name: "A店" } },
      { tenant_id: "t2", status: "pending", tenants: { name: "B店" } },
      { tenant_id: "t1", status: "approved", tenants: { name: "A店" } },
      { tenant_id: "t3", status: "rejected", tenants: { name: "C店" } },
      { tenant_id: "t4", status: "approved", tenants: [{ name: "D店" }] },
      { tenant_id: "t5", status: "approved", tenants: null },
    ];
    expect(approvedTenants(rows)).toEqual([
      { id: "t1", name: "A店" },
      { id: "t4", name: "D店" },
      { id: "t5", name: null },
    ]);
  });

  it("承認済みが無ければ空", () => {
    expect(approvedTenants([{ tenant_id: "t1", status: "withdrawn" }])).toEqual([]);
  });
});

/** 表ごとに結果を返し、表ごとの eq 条件を記録するモック。 */
function mockAdminByTable(results: Record<string, { data: unknown[] | null; error: unknown }>) {
  const eqs: Record<string, [string, unknown][]> = {};
  const from = vi.fn((table: string) => {
    eqs[table] = [];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, v: unknown) => {
        eqs[table].push([col, v]);
        return chain;
      }),
      limit: vi.fn(async () => results[table]),
    };
    return chain;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from } as any, eqs };
}

describe("isParticipatingTenant", () => {
  const Q = { manufacturerId: "m1", tenantId: "t1" };
  const none = { data: [], error: null };

  it("承認済みの応募があれば true（メーカー・施工店・approved で絞る）", async () => {
    const { admin, eqs } = mockAdminByTable({ ft_applications: { data: [{ id: "a1" }], error: null }, ft_jobs: none });
    expect(await isParticipatingTenant(admin, Q)).toBe(true);
    expect(eqs.ft_applications).toEqual([
      ["manufacturer_id", "m1"],
      ["tenant_id", "t1"],
      ["status", "approved"],
    ]);
    expect(eqs.ft_jobs).toEqual([
      ["manufacturer_id", "m1"],
      ["tenant_id", "t1"],
    ]);
  });

  it("応募が無くても案件を割り当てていれば true", async () => {
    const { admin } = mockAdminByTable({ ft_applications: none, ft_jobs: { data: [{ id: "j1" }], error: null } });
    expect(await isParticipatingTenant(admin, Q)).toBe(true);
  });

  it("どちらも無ければ false（他社だけに参加している施工店）", async () => {
    const { admin } = mockAdminByTable({ ft_applications: none, ft_jobs: none });
    expect(await isParticipatingTenant(admin, Q)).toBe(false);
  });

  it("問い合わせが失敗したら投げる（黙って通さない）", async () => {
    const { admin } = mockAdminByTable({ ft_applications: none, ft_jobs: { data: null, error: new Error("db down") } });
    await expect(isParticipatingTenant(admin, Q)).rejects.toThrow("db down");
  });
});
