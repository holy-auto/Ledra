import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs スクリプトには型定義が無い
import { extractImports, buildGraph, cyclicEdges, compareWithBaseline } from "./check-lib-cycles.mjs";

/**
 * この検査が本当に「新しい循環」を捕まえるかを確かめるテスト
 * （CLAUDE.md「判断の道具そのものを検証する」）。
 *
 * 実例: LINE クライアントが AI 自動化を直接 import し、AI 自動化も LINE を呼ぶ
 * （src/lib/line/client.ts ↔ src/lib/ai/automation/cancelFlowAuto.ts）。
 */

const cycles = (files: Record<string, string>) => cyclicEdges(buildGraph(files).graph);

describe("check-lib-cycles", () => {
  it("一方向の依存は循環にならない", () => {
    expect(
      cycles({
        "line/client.ts": `import { log } from "@/lib/logger";`,
        "ai/automation/cancelFlowAuto.ts": `import { send } from "@/lib/line/client";`,
        "logger.ts": "",
      }),
    ).toEqual([]);
  });

  it("逆向きの import を1本足すと、両方向の辺が循環として出る", () => {
    expect(
      cycles({
        "line/client.ts": `import { maybeAuto } from "@/lib/ai/automation/inboundAuto";`,
        "ai/automation/cancelFlowAuto.ts": `import { send } from "@/lib/line/client";`,
      }),
    ).toEqual(["ai -> line", "line -> ai"]);
  });

  it("3つ以上を経由する循環と、相対パス・動的 import も拾う", () => {
    expect(
      cycles({
        "a/x.ts": `import { b } from "../b/y";`,
        "b/y.ts": `const c = await import("@/lib/c");`,
        "c.ts": `export { a } from "./a/x";`,
      }),
    ).toEqual(["a -> b", "b -> c", "c -> a"]);
  });

  it("型だけの import とコメント内の使用例は依存に数えない", () => {
    // src/lib/api/parseBody.ts の JSDoc にある使用例を数えて、
    // 実在しない api → validations → staff → auth → api の循環を出したことがある。
    const src = `
      import type { Role } from "@/lib/auth/roles";
      export type { Plan } from "@/lib/billing/plans";
      /**
       * import { orderCreateSchema } from "@/lib/validations/order";
       */
      // import { x } from "@/lib/staff";
      import { real } from "@/lib/logger";
    `;
    expect(extractImports(src)).toEqual(["@/lib/logger"]);
  });

  // 以下は正規表現で拾っていた版を /code-review が崩した入力（PR #1373）。
  it("文字列や行コメントの中の `/*` で、その後の import を見落とさない", () => {
    const src = `
      const csp = "https://*.supabase.co";
      // 対象: /admin/*
      import { send } from "@/lib/line/client";
      export async function f() { return import("@/lib/ai/x"); }
      /** doc */
    `;
    expect(extractImports(src)).toEqual(["@/lib/line/client", "@/lib/ai/x"]);
  });

  it("複数行 import の行末コメントにアポストロフィがあっても拾う", () => {
    const src = `import {\n  sendLine, // don't call before consent\n} from "@/lib/line/client";`;
    expect(extractImports(src)).toEqual(["@/lib/line/client"]);
  });

  it("コードの後ろの行コメント、型の位置の import()、全部 type の import は数えない", () => {
    const src = `
      const s = 1; // e.g. import { x } from "@/lib/staff"
      type C = import("@/lib/ai/x").Cfg;
      let t: typeof import("@/lib/ai/y");
      import { type A, type B } from "@/lib/auth/roles";
      import { type D, real } from "@/lib/billing";
    `;
    expect(extractImports(src)).toEqual(["@/lib/billing"]);
  });

  it(".ts のジェネリクス付きアロー関数の後ろの import も拾う（TSX として読まない）", () => {
    const src = `const id = <T>(x: T) => x;\nimport { log } from "@/lib/logger";`;
    expect(extractImports(src, "a/b.ts")).toEqual(["@/lib/logger"]);
  });

  it("`.js` で終わる相対指定子も同じモジュールとして数える", () => {
    expect(
      cycles({
        "line/client.ts": `import { log } from "../logger.js";`,
        "logger.ts": `import { send } from "./line/client.js";`,
      }),
    ).toEqual(["line -> logger", "logger -> line"]);
  });

  it("一覧と比べて、増えた辺と解けた辺を分ける", () => {
    expect(compareWithBaseline(["a -> b", "b -> a", "c -> d"], ["a -> b", "b -> a", "x -> y"])).toEqual({
      added: ["c -> d"],
      removed: ["x -> y"],
    });
  });
});
