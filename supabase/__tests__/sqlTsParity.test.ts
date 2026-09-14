/**
 * 同じ規則が SQL と TypeScript の両方に実装されている箇所を突き合わせる静的監査。
 *
 * なぜ要るか: 2026-08 に「片方だけ変わって黙ってズレる」が繰り返し問題になった。
 * `store_id` と `certificates.reservation_id` は**誰も書かない列で絞って**エラーも
 * 出さずに0件を返し、実データを数えるまで分からなかった。SQL と TS の二重実装は
 * それより静かで、**両方とも正しく動いているように見えたまま違う答えを返す。**
 *
 * DB は起動しない（CI にも無い）。マイグレーションの本文をテキストとして読み、
 * 規則を抜き出して TS 実装と突き合わせる。片方だけ変えるとここが落ちる。
 *
 * ponytail: SQL を正規表現で読む素朴な方式。上限は「本文が素直な CASE /
 * regexp_replace であること」で、複雑な plpgsql には広げられない。抽出できな
 * かったら**黙って通さず**明示的に落とす（下の toBeTruthy 群）。上げるなら
 * テスト用 Postgres を立てて両実装を実際に走らせる形にする。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { calcSizeClass } from "@/lib/ocr/shakensho";
import { normalizeVin } from "@/lib/passport/normalizeVin";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/** `-- 行コメント` を落とす。**コメント本文に対して assert しないため。** */
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

/** 430本を関数ごとに読み直さない。ディレクトリは1回だけ読む。 */
let cache: { file: string; sql: string }[] | null = null;
function allMigrations() {
  if (!cache) {
    cache = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort() // ファイル名昇順 = 適用順
      .map((file) => ({ file, sql: stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf-8")) }));
  }
  return cache;
}

/**
 * 指定の関数を**最後に**定義している本文を返す。後の `CREATE OR REPLACE` が
 * 本番では勝つので、最初の定義を読むと本番と食い違う。
 *
 * 拾い漏らすと**ズレたまま緑になる**ので、次の3つを取りこぼさないこと:
 *  - `public.` 修飾（このリポジトリの10ファイルが使っている）
 *  - タグ付きドル引用符 `$function$ ... $function$`
 *  - 同一ファイル内での再定義（後勝ち）
 */
function latestFunctionBody(fnName: string): string {
  const re = new RegExp(
    // 本文は `AS $tag$ ... $tag$`。tag は空文字（= `$$`）もありうる
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fnName}\\s*\\(` +
      `[\\s\\S]*?AS\\s*\\$(\\w*)\\$([\\s\\S]*?)\\$\\1\\$`,
    "gi",
  );
  let found: string | null = null;
  for (const { sql } of allMigrations()) {
    const last = [...sql.matchAll(re)].at(-1);
    if (last) found = last[0];
  }
  if (!found) throw new Error(`${fnName}() を定義しているマイグレーションが見つからない`);
  return found;
}

describe("SQL と TS の二重実装が一致していること", () => {
  describe("calc_size_class_from_volume() ↔ calcSizeClass()", () => {
    const body = latestFunctionBody("calc_size_class_from_volume");
    const thresholds = [...body.matchAll(/WHEN\s+vol_m3\s*<\s*([\d.]+)\s*THEN\s*'([A-Z]+)'/gi)].map(
      ([, limit, cls]) => ({ limit: Number(limit), cls }),
    );
    const elseCls = body.match(/ELSE\s*'([A-Z]+)'/i)?.[1];

    it("SQL からしきい値を読み出せる（読めなければ以降が全部空振りする）", () => {
      expect(thresholds.length).toBeGreaterThan(0);
      expect(elseCls).toBeTruthy();
    });

    /** SQL の CASE をそのまま写したもの（比較の基準） */
    const sqlClassify = (volumeM3: number): string => {
      for (const { limit, cls } of thresholds) if (volumeM3 < limit) return cls;
      return elseCls!;
    };

    it("SQL 側は分類の前に小数第2位へ丸めている（TS もそう揃えている前提）", () => {
      // 呼び出し4箇所と volume_m3 生成列がすべて ROUND(_, 2)。丸めないと
      // しきい値の直下 0.005 幅で答えが割れる
      const callSites = allMigrations().filter(({ sql }) =>
        /calc_size_class_from_volume\(\s*\n?\s*ROUND\(/i.test(sql),
      );
      expect(callSites.length).toBeGreaterThan(0);
      const generated = allMigrations().some(({ sql }) => /volume_m3\s+numeric\(5,\s*2\)/i.test(sql));
      expect(generated).toBe(true);
    });

    it("同じ寸法に対して SQL の規則と TS 実装が同じ区分を返す", () => {
      const mismatches: string[] = [];
      const seen = new Set<string>();
      const check = (l: number, w: number, h: number) => {
        // SQL が受け取るのは ROUND された体積
        const expected = sqlClassify(Math.round(((l * w * h) / 1e9) * 100) / 100);
        const actual = calcSizeClass(l, w, h);
        seen.add(expected);
        if (actual !== expected) mismatches.push(`${l}x${w}x${h}mm: SQL=${expected} TS=${actual}`);
      };

      // (1) 立方体で全しきい値を横断
      for (let side = 1500; side <= 3000; side += 1) check(side, side, side);

      // (2) **丸めの帯を狙い撃つ。** 各しきい値の直下 0.005 幅は、立方体の掃引
      //     （12m³ 付近で1辺1mmあたり約0.0157m³）では**跨げても踏めない**。
      //     実車寸法に近い比率で、丸めると境界に乗る寸法を作って確かめる
      for (const { limit } of thresholds) {
        for (const delta of [-0.004, -0.001, -0.0001, 0, 0.0001, 0.004]) {
          const target = limit + delta; // m³
          const h = 1500;
          const w = 1765;
          const l = (target * 1e9) / (w * h);
          check(Math.round(l * 1e6) / 1e6, w, h);
        }
      }

      expect(mismatches).toEqual([]);
      expect(seen.size, "掃引がしきい値を跨いでいない＝何も検証していない").toBe(thresholds.length + 1);
    });

    it("寸法が有限値でないときは null（SQL の NULL 相当）。0 や負値は SQL に合わせて弾かない", () => {
      expect(body).toMatch(/vol_m3\s+IS\s+NULL\s+THEN\s+NULL/i);
      expect(calcSizeClass(NaN, 1800, 1500)).toBeNull();
      expect(calcSizeClass(Infinity, 1800, 1500)).toBeNull();
      expect(calcSizeClass(null, 1800, 1500)).toBeNull();
      expect(calcSizeClass(undefined, 1800, 1500)).toBeNull();
      // SQL は 0 を NULL 扱いしない（`0 < 8.0` → 'SS'）。ここで弾くと新しいズレになる
      expect(calcSizeClass(0, 1800, 1500)).toBe(sqlClassify(0));
      expect(calcSizeClass(-1, 1800, 1500)).toBe(sqlClassify(-1 * 1800 * 1500 / 1e9));
    });
  });

  describe("vin_normalize() ↔ normalizeVin()", () => {
    const body = latestFunctionBody("vin_normalize");
    const charClass = body.match(/regexp_replace\([\s\S]*?E'\[([^\]]+)\]'/i)?.[1];

    it("SQL から剥がす文字クラスを読み出せる", () => {
      expect(charClass, "文字クラスを読めなければ以降が空振りする").toBeTruthy();
    });

    it("SQL の文字クラスが変わったら気づく（増減どちらも）", () => {
      // `includes` で条件分岐すると、**SQL から文字を消したときに assert ごと
      // 消えて緑のまま通る。**期待値そのものを固定する
      expect(charClass).toBe("\\\\s\\\\-\\\\ufeff");
    });

    it("SQL が列挙している文字を TS も剥がす", () => {
      const samples: Record<string, string> = {
        "\\\\s": " ",
        "\\\\-": "-",
        "\\\\ufeff": "﻿",
      };
      const tokens = charClass!.match(/\\\\(?:u[0-9a-f]{4}|.)/gi) ?? [];
      expect(tokens.length, "文字クラスをトークンに分解できない").toBeGreaterThan(0);
      for (const token of tokens) {
        const ch = samples[token.toLowerCase()];
        expect(ch, `SQL が剥がす ${token} に対応する検証がない — samples に足すこと`).toBeTruthy();
        expect(normalizeVin(`JH4${ch}DC5`), `${token} が TS 側で消えていない`).toBe("JH4DC5");
      }
    });

    it("TS が SQL より多く剥がしていないか（JS の \\s は範囲が広い）", () => {
      // JS の `\s` は U+2028/U+2029 を含むが PostgreSQL の `\s` は含まない。
      // ただし SQL 側は NFKC 正規化を先に通す。ここでは「両者で結果が変わる文字」
      // が増えていないことを、代表的な空白で固定しておく
      for (const ch of [" ", "　", " ", " "]) {
        // NFKC で U+00A0/U+3000 は半角空白になり、SQL の \s も拾う
        expect(normalizeVin(`JH4${ch}DC5`)).toBe("JH4DC5");
      }
    });

    it("SQL と同じく NFKC 正規化と大文字化をする", () => {
      // stripComments 済みなので、コメント内の "NFKC" では通らない
      expect(body).toMatch(/normalize\s*\([\s\S]*?NFKC\s*\)/i);
      expect(body).toMatch(/upper\s*\(/i);
      expect(normalizeVin("ｊｈ４ｄｃ５")).toBe("JH4DC5");
    });

    it("空入力の扱いだけは**意図的に**違う（SQL は NULL、TS は空文字）", () => {
      // 保存側で "" を入れると、車体番号が空の車両どうしが同じキーで一致する。
      // 照合側の "" は何にも一致しないので害が無い。差を消さずに固定しておく。
      expect(body).toMatch(/nullif\s*\(/i);
      expect(normalizeVin("  \t\n  ")).toBe("");
    });
  });
});
