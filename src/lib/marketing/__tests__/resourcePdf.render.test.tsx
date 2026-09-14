import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { RESOURCE_PDFS, pdfSafe } from "../resourcePdf";
import { RESOURCE_CATALOG } from "../resourceCatalog";
import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";
import { GLOSSARY, GLOSSARY_CATEGORIES } from "../glossary";

/**
 * PDF のページツリーは `<< /Type /Pages /Count N ... >>` という非圧縮の辞書として
 * 書き出される。ここから総ページ数を読む。
 */
function pageCountOf(buf: Buffer): number {
  const counts = [...buf.toString("latin1").matchAll(/\/Count (\d+)/g)].map((m) => Number(m[1]));
  expect(counts.length, "PDF に /Count が見つからない（想定した構造ではない）").toBeGreaterThan(0);
  return Math.max(...counts);
}

describe("marketing resource PDFs", () => {
  // 資料は全て「ライブデータから毎回生成する」設計なので、レンダリング自体が
  // 落ちないことと、カタログに書いたページ数が実物と一致することを実際に描いて確かめる。
  for (const [key, entry] of Object.entries(RESOURCE_PDFS)) {
    it(`${key} renders to a valid PDF`, async () => {
      const buf = await renderToBuffer(await entry.doc({ locale: "ja" }));
      expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
      expect(buf.byteLength).toBeGreaterThan(10_000);

      const declared = RESOURCE_CATALOG.find((r) => r.key === key)?.pageCount;
      if (declared !== undefined) {
        expect(pageCountOf(buf), `カタログの pageCount (${declared}) が実物とズレている`).toBe(declared);
      }
    }, 120_000);
  }
});

describe("pdfSafe", () => {
  // 実装より広い判定で確かめる（実装と同じプロパティで検査すると、実装の
  // 取りこぼしをテストも同じだけ取りこぼす）。
  const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0F\u20E3]/u;

  /** PDF に流し込んでいるデータモジュールの文字列を全部集める。 */
  const sourceTexts = [
    ...OPERATION_GUIDE_GROUPS.flatMap((g) => [
      g.label,
      g.intro ?? "",
      ...g.guides.flatMap((guide) => [guide.title, ...guide.steps.flatMap((s) => [s.title, s.description])]),
    ]),
    ...Object.values(GLOSSARY_CATEGORIES).flatMap((c) => [c.label, c.description]),
    ...GLOSSARY.flatMap((t) => [t.term, t.reading, t.definition, t.seeAlso?.label ?? ""]),
  ];

  it("PDF に流す全データから絵文字を落とす（埋め込みフォントに絵文字グリフが無く豆腐になるため）", () => {
    // 元データには絵文字が実在する（このテスト自体が無意味になっていないことの確認）。
    expect(sourceTexts.some((t) => EMOJI.test(t))).toBe(true);
    for (const t of sourceTexts) {
      expect(EMOJI.test(pdfSafe(t)), `絵文字が残っている: ${t}`).toBe(false);
    }
  });

  it("Extended_Pictographic 以外の絵文字（国旗・キーキャップ・肌色・ZWJ）も落とす", () => {
    for (const s of ["🇯🇵", "1️⃣", "👍🏽", "👩‍💻", "❤️"]) {
      expect(EMOJI.test(pdfSafe(s)), `落とし残し: ${s}`).toBe(false);
    }
  });

  it("絵文字を消しても日本語・記号はそのまま残す", () => {
    expect(pdfSafe("🪪 証明書発行")).toBe("証明書発行");
    expect(pdfSafe("Cmd+K で素早く移動・検索")).toBe("Cmd+K で素早く移動・検索");
    expect(pdfSafe("車両 360° ビュー")).toBe("車両 360° ビュー");
  });
});

/**
 * 埋め込みフォントに**グリフが無い文字**を PDF に流すと .notdef ＝ 豆腐になり、
 * ファイルを開くまで誰も気づかない（実際、料金プランの比較表は `✓` が
 * 全部豆腐のまま出ていた）。全8資料が実際に描く文字列を走査して、
 * サブセットで出せない文字が1つも残っていないことを確かめる。
 */
describe("グリフ網羅", () => {
  const require_ = createRequire(process.cwd() + "/package.json");

  /** react-pdf の要素ツリーから、実際に描画される文字列を集める。 */
  function collectText(node: unknown, out: string[], depth = 0): void {
    if (node == null || typeof node === "boolean" || depth > 80) return;
    if (typeof node === "string" || typeof node === "number") {
      out.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) collectText(n, out, depth + 1);
      return;
    }
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (!el.props) return;
    // 機能コンポーネントは呼び出して展開する（しないと <Xxx /> で walk が止まる）
    if (typeof el.type === "function") {
      collectText((el.type as (p: unknown) => unknown)(el.props), out, depth + 1);
      return;
    }
    if (typeof el.props.render === "function") {
      out.push(String((el.props.render as (o: unknown) => unknown)({ pageNumber: 1, totalPages: 1 })));
    }
    collectText(el.props.children, out, depth + 1);
  }

  it("全8資料の描画文字に、サブセットで出せない文字が無い", async () => {
    const font = require_("fontkit").openSync("public/fonts/NotoSansJP-400.ttf") as {
      hasGlyphForCodePoint(cp: number): boolean;
    };
    // 検査自体が空振りしていないことの確認（"✓" は意図的に非収録）
    expect(font.hasGlyphForCodePoint("✓".codePointAt(0)!)).toBe(false);

    const missing: string[] = [];
    for (const [key, entry] of Object.entries(RESOURCE_PDFS)) {
      const texts: string[] = [];
      collectText(await entry.doc({ locale: "ja" }), texts);
      expect(texts.length, `${key}: 文字列が1つも集まらなかった（walk が壊れている）`).toBeGreaterThan(20);
      for (const t of texts) {
        for (const ch of t) {
          const cp = ch.codePointAt(0)!;
          if (cp === 10 || cp === 9) continue;
          if (!font.hasGlyphForCodePoint(cp)) {
            missing.push(`${key}: "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`);
          }
        }
      }
    }
    expect([...new Set(missing)], "グリフの無い文字が残っている（pdfSafe の置換表に足す）").toEqual([]);
  }, 180_000);

  it("pdfSafe が非収録の記号を収録済みの字に置き換える", () => {
    expect(pdfSafe("✓")).toBe("あり");
    expect(pdfSafe("膜厚 μm")).toBe("膜厚 µm");
    expect(pdfSafe("SiO₂")).toBe("SiO2");
    expect(pdfSafe("① 伝わらない摩擦")).toBe("1. 伝わらない摩擦");
  });
});

/**
 * PDF が差し込む画面キャプチャのファイル名と、撮影スクリプトが出力する
 * ファイル名の突き合わせ。
 *
 * 両者がズレると**撮影しても永久にスライドが出ない**（ScreenshotSlide は
 * ファイルが無ければ黙ってページごと消えるため、失敗が表に出ない）。
 * リポジトリにキャプチャを置いていないので実物では確かめられない。
 * `sqlTsParity.test.ts` と同じく、相手側のソースをテキストとして読んで照合する。
 */
describe("画面キャプチャのファイル名", () => {
  it("PDF が参照する全キャプチャを、撮影スクリプトが出力する", () => {
    const pdfSrc = readFileSync("src/lib/marketing/resourcePdf.tsx", "utf8");
    const captureSrc = readFileSync("scripts/capture-screenshots.ts", "utf8");

    const referenced = [...pdfSrc.matchAll(/file:\s*"([^"]+\.png)"/g)].map((m) => m[1]);
    // 検査が空振りしていないことの確認（ScreenshotSlide を消したら気づける）
    expect(referenced.length, "PDF が参照するキャプチャが1つも見つからない").toBeGreaterThan(0);

    const missing = referenced.filter((f) => !captureSrc.includes(`"${f}"`));
    expect(missing, "撮影スクリプトが出力しないファイルを PDF が参照している").toEqual([]);
  });

  /**
   * `.gitignore` は `public/screenshots/**` を丸ごと除外している（動画用の撮影が
   * 大量の PNG を吐くため）。撮影するのは Remotion の動画ワークフローだけで、
   * 成果物は artifact に上がるだけ ―― Vercel のビルドは撮影しない。
   * つまり**リポジトリに無いキャプチャは本番の PDF に永久に出ない**。
   * ScreenshotSlide はファイルが無ければ黙ってページごと消すので、
   * 除外されたままでも配布物は「成立してしまう」＝失敗が表に出ない。
   */
  it("PDF が参照するキャプチャが .gitignore で除外されていない", () => {
    const pdfSrc = readFileSync("src/lib/marketing/resourcePdf.tsx", "utf8");
    const referenced = [...pdfSrc.matchAll(/file:\s*"([^"]+\.png)"/g)].map((m) => `public/screenshots/${m[1]}`);
    expect(referenced.length).toBeGreaterThan(0);

    // git check-ignore は「除外されたパス」を出力し、1件も無ければ終了コード1。
    const ignored = spawnSync("git", ["check-ignore", ...referenced], { encoding: "utf8" });
    expect(ignored.error, "git を実行できない").toBeUndefined();

    // 検査が空振りしていないことの確認（この規則自体が消えたら気づける）
    const control = spawnSync("git", ["check-ignore", "public/screenshots/admin/login.png"], {
      encoding: "utf8",
    });
    expect(control.stdout.trim(), "screenshots の一括除外が無くなっている").not.toBe("");

    expect(
      ignored.stdout.split("\n").filter(Boolean),
      "PDF が参照するキャプチャが .gitignore で除外されている（コミットできず本番に出ない）",
    ).toEqual([]);
  });
});
