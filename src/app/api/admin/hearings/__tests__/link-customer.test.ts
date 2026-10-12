import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ヒアリング→顧客連携が「黙って半分だけ成功する」ことを防ぐ検査。
 *
 * 3つの書き込み（顧客・車両・ヒアリング更新）そのものは DB 側の
 * `public.link_hearing_customer` に1トランザクションでまとめてあるので、
 * **原子性・二度押し・車両だけの失敗は SQL 側の検査**が行を入れて確かめている
 * （`scripts/replay/checks/link_hearing_customer.sql`、`npm run check:migrations`）。
 *
 * ここで見るのはルート層の責任だけ:
 *   - 関数に**呼び出し元のテナント**を渡しているか
 *   - 返り値の各形（not_found / 車両だけ失敗 / 想定外）を取り違えずに HTTP に写しているか
 *   - 生の DB メッセージ・SQLSTATE を画面へ出していないか
 *   - PUT の通常更新が、送っていない列を触らないか／DB の CHECK に無い status を 400 で止めるか
 */
const HEARING_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

let rpcRes: { data: unknown; error: unknown };
const rpcCalls: { fn: string; args: unknown }[] = [];
let updateRes: { error: unknown };
const updates: Record<string, unknown>[] = [];

const supabase = {
  from(_table: string) {
    const q = {
      select: () => q,
      eq: () => q,
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
  rpc: async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return rpcRes;
  },
};

vi.mock("@/lib/api/withCaller", () => ({
  withCaller: (h: (req: Request, ctx: unknown) => Promise<Response>) => async (req: Request) =>
    h(req, { caller: { tenantId: "t1", userId: "u1" }, supabase }),
}));

const { PUT } = await import("../route");
const put = (body: Record<string, unknown>) =>
  (PUT as unknown as (r: Request) => Promise<Response>)(
    new Request("https://app.example/api/admin/hearings", { method: "PUT", body: JSON.stringify(body) }),
  );
const link = () => put({ id: HEARING_ID, action: "link_customer" });

describe("PUT /api/admin/hearings action=link_customer", () => {
  beforeEach(() => {
    rpcRes = {
      data: { ok: true, customer_id: "c1", vehicle_id: "v1", vehicle_error_code: null },
      error: null,
    };
    updateRes = { error: null };
    updates.length = 0;
    rpcCalls.length = 0;
  });

  it("1トランザクションの関数を、呼び出し元のテナント付きで呼ぶ", async () => {
    const res = await link();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, customer_id: "c1", vehicle_id: "v1" });
    // テナントを渡し忘れると、関数側の絞り込みが RLS だけになる（複数テナントに属する
    // ユーザで、別テナントのヒアリングを連携できてしまう）。
    expect(rpcCalls).toEqual([{ fn: "link_hearing_customer", args: { p_hearing_id: HEARING_ID, p_tenant_id: "t1" } }]);
  });

  it("車両だけ落ちた返り値は 200 + vehicle_error。SQLSTATE は画面へ出さない", async () => {
    rpcRes = {
      data: { ok: true, customer_id: "c1", vehicle_id: null, vehicle_error_code: "23502" },
      error: null,
    };
    const res = await link();
    // 顧客とヒアリングは確定しているので失敗にはしない（押し直しを誘発しない）。
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.vehicle_id).toBeNull();
    expect(j.vehicle_error).toContain("車両の登録に失敗");
    expect(JSON.stringify(j)).not.toContain("23502");
  });

  it("not_found は 404、関数の失敗は 500。ok が無い返り値を成功にしない", async () => {
    rpcRes = { data: { ok: false, error: "not_found" }, error: null };
    expect((await link()).status).toBe(404);

    rpcRes = { data: null, error: { code: "42501", message: "permission denied" } };
    expect((await link()).status).toBe(500);

    // 返り値の形が想定と違うとき（null・ok 無し）は 500。黙って ok: true を返さない。
    rpcRes = { data: null, error: null };
    expect((await link()).status).toBe(500);
    rpcRes = { data: { customer_id: "c1" }, error: null };
    const res = await link();
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("通常更新は送っていない列を触らない（省いた列が null で消えない）", async () => {
    const res = await put({ id: HEARING_ID, customer_name: "新しい名前" });
    expect(res.status).toBe(200);
    // zod の textField に `.transform((v) => v || null)` が戻ると、ここに
    // vehicle_maker: null 以下18列が並ぶ（= 入力が消える）。
    expect(Object.keys(updates[0]).sort()).toEqual(["customer_name", "updated_at"]);
    // 関数は通常更新では呼ばない。
    expect(rpcCalls).toEqual([]);
  });

  it("status は本番 DB の CHECK と同じ3値だけ通す（完了ボタンが 400 で死なない）", async () => {
    // BrandingHearingClient.handleComplete が送る値。zod に無かったので常に 400 だった。
    expect((await put({ id: HEARING_ID, status: "completed" })).status).toBe(200);
    expect(updates[0]).toMatchObject({ status: "completed" });
    // DB の CHECK に無い値は 500（CHECK 違反）ではなく 400 で止める。
    for (const bad of ["confirmed", "archived"]) {
      updates.length = 0;
      expect((await put({ id: HEARING_ID, status: bad })).status).toBe(400);
      expect(updates).toEqual([]);
    }
  });

  it("明示的な null は 400。500 にしない", async () => {
    // hearings.customer_name は本番で NOT NULL（既定 ''）。null をそのまま書くと 23502 になる。
    const res = await put({ id: HEARING_ID, customer_name: null });
    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });
});
