/**
 * **入力欄を並べた固定列グリッドが、モバイルで潰れない**ことを固定する。
 *
 * ## なぜこの形なのか
 *
 * `grid-cols-2` のようにブレークポイント接頭辞の無い固定列は、画面幅に関係なく
 * その列数を保つ。入力欄を並べたフォームだと 400px 幅で1列あたり 150px 程度まで
 * 潰れ、ラベルが折り返して読めなくなる。
 *
 * **ただし「固定列かどうか」だけを見ると役に立たない。** カレンダーの曜日列（7列）、
 * Before/After の2枚並べ、レジのタッチタイル、`DataTable` のモバイル用カード表示は
 * どれも固定が正解で、リポジトリ全体では60箇所以上ある。それを一覧にしても
 * 1件ごとの根拠が薄くなり、誰も更新しなくなる。
 *
 * そこで**壊れる条件そのもの**を見る —— 「素の固定列」かつ「中に実際の
 * `input` / `select` / `textarea` がある」。この2つが揃ったときだけ落とす。
 *
 * 最初は正規表現でソース全体を数える形で書いていて、2つ取りこぼした。
 * `grid-cols-[2-9]` が `grid-cols-12` に当たらず、`className={\`...\`}` の
 * テンプレートリテラルも見ていなかった（`/code-review` の指摘）。構文木で見れば
 * どちらも起きない。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { walkSource } from "./sourceScan";
import { parse } from "./astScan";
import ts from "typescript";

/**
 * 対象外のディレクトリ。
 *
 * マーケティングとピッチ資料は、**製品画面のミニチュア模型**（`text-[0.5rem]` の
 * 疑似ダッシュボード）と固定レイアウトのスライドでできている。縮小した見た目
 * そのものが成果物なので、レスポンシブにすると設計意図が壊れる。
 */
const EXCLUDED = /^src\/(components\/marketing|app\/\(marketing\)|app\/pitch)\//;

/**
 * **入力欄入りの固定列グリッドのうち、固定のままでよいもの。**
 *
 * | 場所 | なぜ固定でよいか |
 * |---|---|
 * | `PackageEditor` | 12列だが**子が `col-span-12 sm:col-span-4` と応答的**。正しい書き方 |
 * | `MarketClient` | 2列だが検索欄が `col-span-2` で**実質全幅**。潰れない |
 */
const INTENTIONAL = new Set([
  "src/app/admin/service-packages/[id]/PackageEditor.tsx",
  "src/app/market/MarketClient.tsx",
]);

/** 接頭辞の付かない素の `grid-cols-N`。`sm:grid-cols-2` の `:` に当たらないようにする。 */
const BARE_COLS = /(?<![\w:-])grid-cols-(\d+)\b/;
const INPUT_TAG = /^(input|select|textarea)$/;

function classNameOf(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | null {
  for (const a of el.attributes.properties) {
    if (!ts.isJsxAttribute(a) || a.name.getText() !== "className" || !a.initializer) continue;
    const init = a.initializer;
    if (ts.isStringLiteral(init)) return init.text;
    // `className={`grid grid-cols-2 ${x}`}` も読む（テンプレートリテラルを取りこぼさない）
    if (ts.isJsxExpression(init) && init.expression) return init.expression.getText();
  }
  return null;
}

function tagNameOf(n: ts.Node): string {
  if (ts.isJsxElement(n)) return n.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText();
  return "";
}

function containsInput(n: ts.Node): boolean {
  let found = false;
  const visit = (x: ts.Node) => {
    if (found) return;
    if (INPUT_TAG.test(tagNameOf(x))) found = true;
    else ts.forEachChild(x, visit);
  };
  ts.forEachChild(n, visit);
  return found;
}

/**
 * そのソースにある「素の固定列 × 入力欄あり」の箇所を返す。
 *
 * ponytail: 判定は**タグ名と className の見た目**だけに拠る素朴なもの。
 * 子が `col-span-*` で全幅に伸びている場合（`MarketClient`）や、子側だけを
 * 応答的にしている場合（`PackageEditor`）は区別できないので、上の一覧で個別に許す。
 * 数が増えて一覧が維持できなくなったら、算出した列幅で判定する方へ上げる。
 */
export function findCrampedFormGrids(src: string, fileName: string): number[] {
  const sf = parse(src, fileName);
  const out: number[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const cn = classNameOf(n.openingElement);
      const m = cn ? BARE_COLS.exec(cn) : null;
      if (m && Number(m[1]) >= 2 && containsInput(n)) {
        out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("入力欄を並べた固定列グリッド", () => {
  it("モバイルで潰れるフォームが無い", () => {
    const offenders: string[] = [];
    for (const p of walkSource("src")) {
      if (p.includes("__tests__") || EXCLUDED.test(p) || INTENTIONAL.has(p)) continue;
      for (const line of findCrampedFormGrids(readFileSync(p, "utf8"), p)) {
        offenders.push(`${p}:${line}`);
      }
    }
    // 落ちたら: `grid-cols-1 sm:grid-cols-2` のように接頭辞を付ける。
    // 子が全幅に伸びるなどで潰れないなら、上の INTENTIONAL に理由を書いて足す。
    expect(offenders).toEqual([]);
  });

  it("検出器が空振りしていない", () => {
    const cramped = `const A = () => <div className="grid grid-cols-2 gap-3"><input value={x} /></div>;`;
    expect(findCrampedFormGrids(cramped, "a.tsx")).toHaveLength(1);

    // 接頭辞が付いていれば対象外
    const ok = `const A = () => <div className="grid grid-cols-1 sm:grid-cols-2"><input value={x} /></div>;`;
    expect(findCrampedFormGrids(ok, "a.tsx")).toHaveLength(0);

    // 入力欄が無ければ対象外（画像2枚並べ・カレンダーなど）
    const noInput = `const A = () => <div className="grid grid-cols-7"><span>月</span></div>;`;
    expect(findCrampedFormGrids(noInput, "a.tsx")).toHaveLength(0);

    // 旧実装が取りこぼした2つ: 10列以上と、テンプレートリテラルの className
    const twelve = `const A = () => <div className="grid grid-cols-12"><input value={x} /></div>;`;
    expect(findCrampedFormGrids(twelve, "a.tsx")).toHaveLength(1);
    const tmpl = "const A = () => <div className={`grid grid-cols-2 ${k}`}><input value={x} /></div>;";
    expect(findCrampedFormGrids(tmpl, "a.tsx")).toHaveLength(1);
  });
});
