import { describe, it, expect } from "vitest";
import { createCustomerResolver, createCustomerResolverFromCandidates } from "@/lib/customers/resolveCustomer";
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

describe("createCustomerResolver", () => {
  it("候補の読み込みに失敗したら新規作成せず skipped（重複顧客を作らない）", async () => {
    const inserted: unknown[] = [];
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "boom" } }) }) }),
        }),
        insert: (row: unknown) => (
          inserted.push(row),
          { select: () => ({ single: async () => ({ data: row, error: null }) }) }
        ),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const resolver = await createCustomerResolver(admin, TENANT, { ai: false });
    expect(await resolver.resolve({ name: "山田太郎" })).toEqual({
      customerId: null,
      method: "skipped",
      confidence: 0,
    });
    expect(inserted).toEqual([]);
  });

  /**
   * customers をキーセット（order(id).limit(n).gt(id, last)）でページ取得する偽 admin。
   * cap はサーバ側の max_rows（1 回で返す最大件数）。failAfterPages ページ目以降はエラーを返す。
   */
  function pagedAdmin(rows: CustomerCandidate[], cap: number, failAfterPages = Infinity) {
    const inserted: unknown[] = [];
    let pages = 0;
    const sorted = [...rows].sort((x, y) => (x.id < y.id ? -1 : 1));
    const admin = {
      from: () => {
        let after: string | null = null;
        let lim = Infinity;
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: (n: number) => ((lim = n), q),
          gt: (_c: string, v: string) => ((after = v), q),
          then: (resolve: (r: unknown) => unknown) => {
            pages += 1;
            if (pages > failAfterPages) return resolve({ data: null, error: { message: "timeout" } });
            const from = after ? sorted.findIndex((r) => r.id > after!) : 0;
            const data = from < 0 ? [] : sorted.slice(from, from + Math.min(lim, cap));
            return resolve({ data, error: null });
          },
          insert: (row: unknown) => (
            inserted.push(row),
            { select: () => ({ single: async () => ({ data: { id: "new", ...(row as object) }, error: null }) }) }
          ),
        };
        return q;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    return { admin, inserted };
  }
  const filler = (n: number): CustomerCandidate[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `f${i}`,
      name: `別人${i}号`,
      name_kana: null,
      phone: null,
      email: null,
    }));

  it("1000 件を超える顧客でも、後ろのページの既存顧客に連携する（重複顧客を作らない）", async () => {
    const target: CustomerCandidate = { id: "z-last", name: "山田太郎", name_kana: null, phone: null, email: null };
    const { admin, inserted } = pagedAdmin([...filler(1500), target], 1000);
    const r = await (await createCustomerResolver(admin, TENANT, { ai: false })).resolve({ name: "山田太郎" });
    expect(r).toMatchObject({ customerId: "z-last", method: "linked" });
    expect(inserted).toEqual([]);
  });

  it("サーバ側の上限が 1000 より小さくても取りこぼさない", async () => {
    const target: CustomerCandidate = { id: "z-last", name: "山田太郎", name_kana: null, phone: null, email: null };
    const { admin } = pagedAdmin([...filler(700), target], 300);
    const r = await (await createCustomerResolver(admin, TENANT, { ai: false })).resolve({ name: "山田太郎" });
    expect(r.customerId).toBe("z-last");
  });

  it("2 ページ目以降の読み込みに失敗したら、重複顧客を作らず未連携（skipped）", async () => {
    const { admin, inserted } = pagedAdmin(filler(1500), 1000, 1);
    const r = await (await createCustomerResolver(admin, TENANT, { ai: false })).resolve({ name: "山田太郎" });
    expect(r.method).toBe("skipped");
    expect(inserted).toEqual([]);
  });
});
