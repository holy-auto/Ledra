import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ヒアリング→顧客連携が「黙って半分だけ成功する」ことを防ぐ検査。
 *
 * 直した握り潰しは3つ: ヒアリング取得の DB エラー（404 に化けていた）、
 * 車両 insert のエラー（捨てていた）、ヒアリング更新のエラー（受け取ってもいなかった）。
 */
const HEARING_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

type Res = { data: unknown; error: unknown };
let hearingRes: Res;
let customerRes: Res;
let vehicleRes: Res;
let updateRes: { error: unknown };
const updates: Record<string, unknown>[] = [];

const supabase = {
  from(table: string) {
    const q = {
      select: () => q,
      eq: () => q,
      insert: () => q,
      single: async () => (table === "customers" ? customerRes : table === "vehicles" ? vehicleRes : hearingRes),
      // `.eq()` は連鎖もできて await もできる（通常更新は .eq を2回繋ぐ）。
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        const upd = {
          eq: () => upd,
          then: <T>(onFulfilled: (v: { error: unknown }) => T) => Promise.resolve(updateRes).then(onFulfilled),
        };
        return upd;
      },
    };
    return q;
  },
};

vi.mock("@/lib/api/withCaller", () => ({
  withCaller: (h: (req: Request, ctx: unknown) => Promise<Response>) => async (req: Request) =>
    h(req, { caller: { tenantId: "t1", userId: "u1" }, supabase }),
}));

const { PUT } = await import("../route");
const link = () =>
  (PUT as unknown as (r: Request) => Promise<Response>)(
    new Request("https://app.example/api/admin/hearings", {
      method: "PUT",
      body: JSON.stringify({ id: HEARING_ID, action: "link_customer" }),
    }),
  );

describe("PUT /api/admin/hearings action=link_customer", () => {
  beforeEach(() => {
    hearingRes = {
      data: { id: HEARING_ID, customer_name: "山田", vehicle_maker: "トヨタ", vehicle_model: "ハイエース" },
      error: null,
    };
    customerRes = { data: { id: "c1" }, error: null };
    vehicleRes = { data: { id: "v1" }, error: null };
    updateRes = { error: null };
    updates.length = 0;
  });

  it("正常系は車両まで紐付け、vehicle_error は付かない", async () => {
    const res = await link();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j).toMatchObject({ ok: true, customer_id: "c1", vehicle_id: "v1" });
    expect(j.vehicle_error).toBeUndefined();
    expect(updates[0]).toMatchObject({ customer_id: "c1", vehicle_id: "v1", status: "linked" });
  });

  it("車両 insert が落ちても顧客連携は完遂し、落ちたことを返す", async () => {
    vehicleRes = { data: null, error: { code: "23502", message: "null value in column maker" } };
    const res = await link();
    // 顧客行は作成済みなので 500 では返さない（押し直しで顧客が二重に増える）。
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.vehicle_id).toBeNull();
    expect(j.vehicle_error).toContain("車両の登録に失敗");
    // 生の DB メッセージを画面へ出さない。
    expect(JSON.stringify(j)).not.toContain("null value in column");
    expect(updates[0]).toMatchObject({ vehicle_id: null, status: "linked" });
  });

  it("ヒアリング更新が落ちたら 500。ok: true で返さない", async () => {
    updateRes = { error: { code: "42501", message: "permission denied" } };
    const res = await link();
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("通常更新は送っていない列を触らない（省いた列が null で消えない）", async () => {
    const res = await (PUT as unknown as (r: Request) => Promise<Response>)(
      new Request("https://app.example/api/admin/hearings", {
        method: "PUT",
        body: JSON.stringify({ id: HEARING_ID, customer_name: "新しい名前" }),
      }),
    );
    expect(res.status).toBe(200);
    // zod の textField に `.transform((v) => v || null)` が戻ると、ここに
    // vehicle_maker: null 以下18列が並ぶ（= 入力が消える）。
    expect(Object.keys(updates[0]).sort()).toEqual(["customer_name", "updated_at"]);
  });

  it("ヒアリング取得の DB エラーは 500。404 に化けない", async () => {
    hearingRes = { data: null, error: { code: "42501", message: "permission denied" } };
    expect((await link()).status).toBe(500);
    // 0 行（PGRST116）だけが 404。
    hearingRes = { data: null, error: { code: "PGRST116", message: "no rows" } };
    expect((await link()).status).toBe(404);
  });
});
