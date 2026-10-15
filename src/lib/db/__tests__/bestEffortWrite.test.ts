import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `bestEffortWrite` が「落ちても続ける」書き込みを**黙らせない**ことの検査。
 *
 * この関数の値は「失敗したときにログが出ること」だけなので、そこだけ見る。
 * ログを落とす実装に戻ると、276 件の書き込みが再び無音になる。
 */
const errors: { msg: string; err: unknown; ctx: unknown }[] = [];
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (msg: string, err: unknown, ctx: unknown) => errors.push({ msg, err, ctx }),
    warn: () => {},
    info: () => {},
    debug: () => {},
    child: () => ({}),
  },
}));

const { bestEffortWrite } = await import("../bestEffortWrite");

describe("bestEffortWrite", () => {
  beforeEach(() => {
    errors.length = 0;
  });

  it("成功したらログを出さず true を返す", async () => {
    expect(await bestEffortWrite(Promise.resolve({ error: null }), "a insert")).toBe(true);
    expect(errors).toEqual([]);
  });

  it("`{ error }` で返る失敗を、理由と文脈つきでログに出す", async () => {
    const dbError = { code: "23502", message: "null value in column" };
    const ok = await bestEffortWrite(Promise.resolve({ error: dbError }), "vehicles insert", {
      hearing_id: "h1",
    });
    expect(ok).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain("vehicles insert");
    expect(errors[0].err).toBe(dbError);
    expect(errors[0].ctx).toEqual({ hearing_id: "h1" });
  });

  it("builder が throw しても呼び出し元に例外を出さず、ログに出す", async () => {
    // ネットワーク断など。ここで throw を漏らすと「落ちても続ける」が守れない。
    const ok = await bestEffortWrite(Promise.reject(new Error("socket hang up")), "a update");
    expect(ok).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].msg).toContain("例外");
  });
});
