import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const { resolveCustomerIdByName } = await import("../create");

/** customers の select（候補一覧）と insert（新規作成）だけを模倣する。insert された行を記録する。 */
function makeDb(candidates: unknown[], insertResult: { data: unknown; error: unknown }) {
  const inserted: unknown[] = [];
  const db = {
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => Promise.resolve({ data: candidates, error: null }),
        insert: (row: unknown) => (inserted.push(row), builder),
        single: () => Promise.resolve(insertResult),
      };
      return builder;
    },
  } as unknown as Pick<SupabaseClient, "from">;
  return { db, inserted };
}

describe("resolveCustomerIdByName [証明書→顧客の自動紐付け]", () => {
  it("名前が空なら null（DB に触れない）", async () => {
    const { db, inserted } = makeDb([], { data: { id: "new" }, error: null });
    expect(await resolveCustomerIdByName(db, "t1", "")).toBeNull();
    expect(inserted).toEqual([]);
  });
  it("既存顧客に名寄せできればその id（新規作成しない）", async () => {
    const { db, inserted } = makeDb([{ id: "c1", name: "山田太郎", name_kana: null, phone: null, email: null }], {
      data: { id: "new" },
      error: null,
    });
    expect(await resolveCustomerIdByName(db, "t1", "山田太郎")).toBe("c1");
    expect(inserted).toEqual([]);
  });
  it("該当が無ければ自テナントに新規作成してその id", async () => {
    const { db, inserted } = makeDb([], { data: { id: "new" }, error: null });
    expect(await resolveCustomerIdByName(db, "t1", "佐藤花子")).toBe("new");
    expect(inserted).toEqual([{ tenant_id: "t1", name: "佐藤花子" }]);
  });
  it("作成に失敗したら null（証明書作成は止めない）", async () => {
    const { db } = makeDb([], { data: null, error: { message: "boom" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resolveCustomerIdByName(db, "t1", "佐藤花子")).toBeNull();
  });
});
