import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCompletionInspectorGate } from "../inspectorQualification";

/**
 * 最小の supabase-js クエリビルダ模倣。テーブルごとに maybeSingle（単一）/ await（配列）の結果を返す。
 * 連鎖 .select().eq().eq() は自身を返し、.maybeSingle() と then（配列取得）で結果を解決する。
 */
type Result = { data: unknown; error: unknown };
function makeDb(cfg: Record<string, { single?: Result; list?: Result }>): Pick<SupabaseClient, "from"> {
  return {
    from(table: string) {
      const entry = cfg[table] ?? {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(entry.single ?? { data: null, error: null }),
        then: (resolve: (r: Result) => unknown) => resolve(entry.list ?? { data: [], error: null }),
      };
      return builder as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as Pick<SupabaseClient, "from">;
}

const T = "tenant-1";
const S = "staff-1";

describe("evaluateCompletionInspectorGate [G1 実施者資格ゲート]", () => {
  it("強制OFF: 実施者未指定でもブロックしない（非破壊既定）", async () => {
    const db = makeDb({ tenants: { single: { data: { require_inspector_qualification: false }, error: null } } });
    const r = await evaluateCompletionInspectorGate(db, T, null);
    expect(r.blocked).toBe(false);
    expect(r.snapshot).toBeNull();
  });

  it("強制OFF: 実施者が有資格でなくても通し、スナップショットは残す", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: false }, error: null } },
      staff_members: { single: { data: { qualifications: ["record_author"] }, error: null } },
      staff_qualifications: { list: { data: [], error: null } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(false);
    expect(r.snapshot).toEqual([{ qualification: "record_author", number: null, expires_on: null }]);
  });

  it("強制ON: 実施者未指定はブロック", async () => {
    const db = makeDb({ tenants: { single: { data: { require_inspector_qualification: true }, error: null } } });
    const r = await evaluateCompletionInspectorGate(db, T, null);
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/実施者/);
  });

  it("強制ON: 有効な自動車検査員ならブロックせずスナップショット", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: { qualifications: ["vehicle_inspector"] }, error: null } },
      staff_qualifications: {
        list: { data: [{ qualification: "vehicle_inspector", number: "A-1", expires_on: "2999-12-31" }], error: null },
      },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(false);
    expect(r.snapshot).toEqual([{ qualification: "vehicle_inspector", number: "A-1", expires_on: "2999-12-31" }]);
  });

  it("強制ON: 休止中（is_active=false）の自動車検査員はブロック", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: { qualifications: ["vehicle_inspector"], is_active: false }, error: null } },
      staff_qualifications: { list: { data: [], error: null } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/休止中/);
  });

  it("強制ON: 資格を保有しない実施者はブロック", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: { qualifications: ["maintenance_supervisor"] }, error: null } },
      staff_qualifications: { list: { data: [], error: null } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(true);
  });

  it("強制ON: 期限切れの自動車検査員はブロック", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: { qualifications: ["vehicle_inspector"] }, error: null } },
      staff_qualifications: {
        list: { data: [{ qualification: "vehicle_inspector", number: null, expires_on: "2000-01-01" }], error: null },
      },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(true);
  });

  it("強制ON: スタッフ照会エラーは fail-closed でブロック", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: null, error: { message: "boom" } } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/確認できませんでした/);
  });

  it("強制ON: 実施者が存在しない（行なし）も fail-closed でブロック", async () => {
    const db = makeDb({
      tenants: { single: { data: { require_inspector_qualification: true }, error: null } },
      staff_members: { single: { data: null, error: null } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(true);
  });

  it("tenants 読取りエラーは強制OFF扱い（非破壊・既定false）", async () => {
    const db = makeDb({
      tenants: { single: { data: null, error: { message: "boom" } } },
      staff_members: { single: { data: { qualifications: [] }, error: null } },
      staff_qualifications: { list: { data: [], error: null } },
    });
    const r = await evaluateCompletionInspectorGate(db, T, S);
    expect(r.blocked).toBe(false);
  });
});
