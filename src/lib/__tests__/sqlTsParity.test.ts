/**
 * 同じ規則が SQL と TypeScript の両方に実装されている箇所を突き合わせる。
 *
 * なぜ要るか: 2026-08 に「片方だけ変わって黙ってズレる」が繰り返し問題になった。
 * `store_id` と `certificates.reservation_id` は**誰も書かない列で絞って**エラーも
 * 出さずに0件を返し、実データを数えるまで分からなかった。SQL と TS の二重実装は
 * それより静かで、**両方とも正しく動いているように見えたまま違う答えを返す。**
 *
 * ここは DB を起動しない。マイグレーションの**本文をテキストとして読み**、規則を
 * 抜き出して TS の実装と突き合わせる。片方だけ変えるとここが落ちる。
 *
 * 対象を増やすときは EXTRACT ヘルパを使い、「最後にその関数を定義している
 * マイグレーション」を正とすること（後の migration が CREATE OR REPLACE で
 * 上書きするため、最初の定義を読むと本番と食い違う）。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { calcSizeClass } from "@/lib/ocr/shakensho";
import { normalizeVin } from "@/lib/passport/normalizeVin";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

/**
 * 指定の関数を**最後に**定義しているマイグレーションの本文を返す。
 * ファイル名は昇順＝適用順なので、後勝ちで拾えば本番の実体と一致する。
 */
function latestFunctionBody(fnName: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: string | null = null;
  for (const f of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    // `$$` は本文の開始と終了の両方に出る。開始で止めると本文が取れないので
    // 2つ目まで読む
    const re = new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fnName}\\b[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$`,
      "i",
    );
    const m = sql.match(re);
    if (m) found = m[0];
  }
  if (!found) throw new Error(`${fnName}() を定義しているマイグレーションが見つからない`);
  return found;
}

describe("SQL と TS の二重実装が一致していること", () => {
  describe("calc_size_class_from_volume() ↔ calcSizeClass()", () => {
    // SQL 本文から `WHEN vol_m3 < 8.0 THEN 'SS'` の並びを抜く
    const body = latestFunctionBody("calc_size_class_from_volume");
    const thresholds = [...body.matchAll(/WHEN\s+vol_m3\s*<\s*([\d.]+)\s*THEN\s*'([A-Z]+)'/gi)].map(
      ([, limit, cls]) => ({ limit: Number(limit), cls }),
    );
    const elseCls = body.match(/ELSE\s*'([A-Z]+)'/i)?.[1];

    it("SQL からしきい値を読み出せる（読めなければ以降の検証が空振りする）", () => {
      expect(thresholds.length).toBeGreaterThan(0);
      expect(elseCls).toBeTruthy();
    });

    /** SQL の CASE をそのまま TS で再現したもの（比較の基準） */
    const sqlClassify = (volumeM3: number): string => {
      for (const { limit, cls } of thresholds) if (volumeM3 < limit) return cls;
      return elseCls!;
    };

    it("同じ体積に対して SQL の規則と TS 実装が同じ区分を返す（全しきい値を横断）", () => {
      // 寸法から体積を出す往復（cbrt）は浮動小数の誤差を持ち込むので**しない**。
      // 寸法を振って、TS が使うのと同じ式で体積を出し、その体積で両者を比べる。
      const mismatches: string[] = [];
      const crossed = new Set<string>();
      for (let side = 1500; side <= 3000; side += 1) {
        const volume = (side * side * side) / 1e9;
        const expected = sqlClassify(volume);
        const actual = calcSizeClass(side, side, side);
        crossed.add(expected);
        if (actual !== expected)
          mismatches.push(`${side}mm立方 (${volume.toFixed(3)}m³): SQL=${expected} TS=${actual}`);
      }
      expect(mismatches).toEqual([]);
      // 掃引がしきい値を実際に跨いでいること（跨がなければ何も検証していない）
      expect(crossed.size).toBe(thresholds.length + 1);
    });

    it("寸法が揃わないときは SQL の NULL と同じく null を返す", () => {
      // SQL: `WHEN vol_m3 IS NULL THEN NULL`
      expect(body).toMatch(/vol_m3\s+IS\s+NULL\s+THEN\s+NULL/i);
      expect(calcSizeClass(NaN, 1800, 1500)).toBeNull();
      expect(calcSizeClass(0, 1800, 1500)).toBeNull();
      expect(calcSizeClass(null, 1800, 1500)).toBeNull();
      expect(calcSizeClass(undefined, 1800, 1500)).toBeNull();
      expect(calcSizeClass(-1, 1800, 1500)).toBeNull();
      expect(calcSizeClass(Infinity, 1800, 1500)).toBeNull();
    });
  });

  describe("vin_normalize() ↔ normalizeVin()", () => {
    const body = latestFunctionBody("vin_normalize");

    it("SQL が剥がす文字を TS も剥がす", () => {
      // SQL 側: regexp_replace(..., E'[\\s\\-\\ufeff]', '', 'g')
      // `[^,]+` では `normalize(coalesce(raw, \'\'), NFKC)` の中のカンマで止まる。
      // 文字クラスそのものを直接拾う
      const charClass = body.match(/E'\[([^\]]+)\]'/)?.[1];
      expect(charClass, "SQL から文字クラスを読み出せる").toBeTruthy();

      // SQL の `\s` は PostgreSQL の定義、TS の `\s` は JS の定義で範囲が違う。
      // PostgreSQL 側が拾わない U+FEFF を SQL が明示列挙しているのはそのため。
      // ここでは「SQL が列挙している文字は TS 側でも消える」ことを確かめる。
      const explicit: Record<string, string> = {
        "\\s": " ",
        "\\-": "-",
        "\\ufeff": "﻿",
      };
      for (const [token, ch] of Object.entries(explicit)) {
        if (charClass!.includes(token)) {
          expect(normalizeVin(`JH4${ch}DC5`), `${token} が TS 側で消えていない`).toBe("JH4DC5");
        }
      }
    });

    it("SQL と同じく NFKC 正規化と大文字化をする", () => {
      expect(body).toMatch(/NFKC/i);
      expect(body).toMatch(/upper\(/i);
      expect(normalizeVin("ｊｈ４ｄｃ５")).toBe("JH4DC5");
    });

    it("空入力の扱いだけは**意図的に**違う（SQL は NULL、TS は空文字）", () => {
      // 保存側で "" を入れると、車体番号が空の車両どうしが同じキーで一致する。
      // 照合側の "" は何にも一致しないので害が無い。差を消さずに固定しておく。
      expect(body).toMatch(/nullif\(/i);
      expect(normalizeVin("  \t\n  ")).toBe("");
    });
  });
});
