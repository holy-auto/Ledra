import { describe, it, expect } from "vitest";
import { resolveExistingVehicleId } from "@/lib/vehicles/resolveExistingVehicle";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 「同じ車か」の判定（代表判断 2026-10-15・選択肢 b）の検査。
 *
 * ここが緩むと**違う車に証明書が付き**、きつくなると**同じ車の行が増える**。
 * どちらも画面上は普通に見えるので、行を入れて確かめる。
 *
 * SQL 側の双子（`public.link_hearing_customer`）は
 * `scripts/replay/checks/link_hearing_customer.sql` が同じ観点で確かめる。
 */
type Row = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  maker: string | null;
  model: string | null;
  plate_display: string | null;
  vin_code_normalized: string | null;
  created_at: string;
};

const T = "t1";
const base = {
  tenant_id: T,
  customer_id: null as string | null,
  maker: null as string | null,
  model: null as string | null,
  plate_display: null as string | null,
  vin_code_normalized: null as string | null,
};

/** eq / is を集めて、最後に行を絞る小さな偽クライアント。 */
function fakeClient(rows: Row[]) {
  return {
    from() {
      const preds: ((r: Row) => boolean)[] = [];
      let newestFirst = false;
      const q = {
        select: () => q,
        eq: (col: keyof Row, val: unknown) => (preds.push((r) => r[col] === val), q),
        is: (col: keyof Row, val: null) => (preds.push((r) => r[col] === val), q),
        order: (_col: string, opts: { ascending: boolean }) => ((newestFirst = !opts.ascending), q),
        limit: () => q,
        maybeSingle: async () => {
          const hit = rows
            .filter((r) => preds.every((p) => p(r)))
            .sort((a, b) =>
              newestFirst ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at),
            );
          return { data: hit[0] ?? null, error: null };
        },
      };
      return q;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as SupabaseClient<any, any, any>;
}

describe("resolveExistingVehicleId", () => {
  it("ナンバーが一致する車両を引く", async () => {
    const rows: Row[] = [
      { ...base, id: "v1", plate_display: "品川300あ1234", created_at: "2026-01-01" },
      { ...base, id: "v2", plate_display: "品川300あ9999", created_at: "2026-01-02" },
    ];
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { plate: "品川300あ1234" })).toBe("v1");
  });

  it("VIN は正規化して引く（全角・小文字・ハイフンでも当たる）", async () => {
    const rows: Row[] = [{ ...base, id: "v9", vin_code_normalized: "ZVW30ABC1234", created_at: "2026-01-01" }];
    // 従来は VIN を保存しているのに照合に使っておらず、VIN 入りでも重複していた。
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { vinCode: "zvw30-abc 1234" })).toBe("v9");
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { vinCode: "ＺＶＷ３０ＡＢＣ１２３４" })).toBe("v9");
  });

  it("ナンバーも VIN も無いときは、顧客 + メーカー + 車種で引く（新しい方）", async () => {
    const rows: Row[] = [
      { ...base, id: "old", customer_id: "c1", maker: "トヨタ", model: "ハイエース", created_at: "2026-01-01" },
      { ...base, id: "new", customer_id: "c1", maker: "トヨタ", model: "ハイエース", created_at: "2026-02-01" },
      { ...base, id: "other", customer_id: "c2", maker: "トヨタ", model: "ハイエース", created_at: "2026-03-01" },
    ];
    expect(
      await resolveExistingVehicleId(fakeClient(rows), T, {
        maker: "トヨタ",
        model: "ハイエース",
        customerId: "c1",
      }),
    ).toBe("new");
  });

  it("**ナンバーがあって当たらなければ、顧客+メーカー+車種には落ちない**", async () => {
    // ここが落ちると、ナンバーを入れた発行が別の車の行に付く。
    const rows: Row[] = [
      { ...base, id: "noplate", customer_id: "c1", maker: "トヨタ", model: "ハイエース", created_at: "2026-01-01" },
    ];
    expect(
      await resolveExistingVehicleId(fakeClient(rows), T, {
        plate: "品川300あ1234",
        maker: "トヨタ",
        model: "ハイエース",
        customerId: "c1",
      }),
    ).toBeNull();
    // VIN でも同じ。
    expect(
      await resolveExistingVehicleId(fakeClient(rows), T, {
        vinCode: "ZVW30XXXX",
        maker: "トヨタ",
        model: "ハイエース",
        customerId: "c1",
      }),
    ).toBeNull();
  });

  it("車種が未入力なら「未入力同士」で一致し、車種入りの行には当たらない", async () => {
    const rows: Row[] = [
      { ...base, id: "withModel", customer_id: "c1", maker: "トヨタ", model: "ハイエース", created_at: "2026-01-01" },
      { ...base, id: "noModel", customer_id: "c1", maker: "トヨタ", model: null, created_at: "2026-01-02" },
    ];
    // メーカーだけで寄せると "withModel" に吸われる。
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { maker: "トヨタ", customerId: "c1" })).toBe("noModel");
    expect(
      await resolveExistingVehicleId(fakeClient(rows), T, { maker: "トヨタ", model: "ハイエース", customerId: "c1" }),
    ).toBe("withModel");
  });

  it("顧客が付いていなければ照合しない（他人の車に寄せない）", async () => {
    const rows: Row[] = [
      { ...base, id: "v1", customer_id: "c1", maker: "トヨタ", model: "ハイエース", created_at: "2026-01-01" },
    ];
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { maker: "トヨタ", model: "ハイエース" })).toBeNull();
  });

  it("メーカーも車種も空なら照合しない", async () => {
    const rows: Row[] = [{ ...base, id: "v1", customer_id: "c1", created_at: "2026-01-01" }];
    expect(await resolveExistingVehicleId(fakeClient(rows), T, { customerId: "c1" })).toBeNull();
  });
});
