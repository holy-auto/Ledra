import { describe, it, expect } from "vitest";
import { createCustomerResolverFromCandidates } from "@/lib/customers/resolveCustomer";
import type { CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";

/**
 * insert().select().single() だけを満たす最小の偽 admin。
 * 作成した顧客に連番 id を振り、記録する。
 */
function makeFakeAdmin() {
  const inserted: Array<Record<string, unknown>> = [];
  const admin = {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  const row = { id: `new-${inserted.length + 1}`, ...payload };
                  inserted.push(row);
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { admin, inserted };
}

const TENANT = "t1";

describe("resolveCustomer", () => {
  it("氏名完全一致は既存顧客に linked する", async () => {
    const candidates: CustomerCandidate[] = [
      { id: "c1", name: "山田太郎", name_kana: "ヤマダタロウ", phone: null, email: null },
    ];
    const { admin, inserted } = makeFakeAdmin();
    const resolver = createCustomerResolverFromCandidates(admin, TENANT, candidates, { ai: false });

    const res = await resolver.resolve({ name: "山田太郎" });
    expect(res.method).toBe("linked");
    expect(res.customerId).toBe("c1");
    expect(inserted).toHaveLength(0);
  });

  it("電話番号完全一致で linked する (記号違いを吸収)", async () => {
    const candidates: CustomerCandidate[] = [
      { id: "c1", name: "誰か", name_kana: null, phone: "090-1111-2222", email: null },
    ];
    const { admin } = makeFakeAdmin();
    const resolver = createCustomerResolverFromCandidates(admin, TENANT, candidates, { ai: false });

    const res = await resolver.resolve({ name: "別名", phone: "09011112222" });
    expect(res.method).toBe("linked");
    expect(res.customerId).toBe("c1");
    expect(res.confidence).toBe(1);
  });

  it("未一致で氏名があれば新規作成 (created)", async () => {
    const { admin, inserted } = makeFakeAdmin();
    const resolver = createCustomerResolverFromCandidates(admin, TENANT, [], { ai: false });

    const res = await resolver.resolve({ name: "佐藤花子", phone: "080-0000-0000" });
    expect(res.method).toBe("created");
    expect(res.customerId).toBe("new-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ tenant_id: TENANT, name: "佐藤花子", phone: "080-0000-0000" });
  });

  it("手がかりが無ければ skipped (作成しない)", async () => {
    const { admin, inserted } = makeFakeAdmin();
    const resolver = createCustomerResolverFromCandidates(admin, TENANT, [], { ai: false });

    const res = await resolver.resolve({ name: "  ", phone: null, email: null });
    expect(res.method).toBe("skipped");
    expect(res.customerId).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("同一バッチ内で同名が続いても二重作成しない", async () => {
    const { admin, inserted } = makeFakeAdmin();
    const resolver = createCustomerResolverFromCandidates(admin, TENANT, [], { ai: false });

    const first = await resolver.resolve({ name: "田中一郎" });
    expect(first.method).toBe("created");
    expect(first.customerId).toBe("new-1");

    const second = await resolver.resolve({ name: "田中一郎" });
    expect(second.method).toBe("linked");
    expect(second.customerId).toBe("new-1");
    expect(inserted).toHaveLength(1);
  });
});
