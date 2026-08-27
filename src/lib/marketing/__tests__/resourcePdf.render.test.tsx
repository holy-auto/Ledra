import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { RESOURCE_PDFS, stripEmoji } from "../resourcePdf";
import { RESOURCE_CATALOG } from "../resourceCatalog";
import { OPERATION_GUIDE_GROUPS } from "@/lib/operationGuides";

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

describe("stripEmoji", () => {
  const EMOJI = /\p{Extended_Pictographic}/u;

  it("運用ガイドの文言から絵文字を落とす（埋め込みフォントに絵文字グリフが無く豆腐になるため）", () => {
    const texts = OPERATION_GUIDE_GROUPS.flatMap((g) =>
      g.guides.flatMap((guide) => [guide.title, ...guide.steps.flatMap((s) => [s.title, s.description])]),
    );
    // 元データには絵文字が実在する（このテスト自体が無意味になっていないことの確認）。
    expect(texts.some((t) => EMOJI.test(t))).toBe(true);
    for (const t of texts) {
      expect(EMOJI.test(stripEmoji(t)), `絵文字が残っている: ${t}`).toBe(false);
    }
  });

  it("絵文字を消しても日本語・記号はそのまま残す", () => {
    expect(stripEmoji("🪪 証明書発行")).toBe("証明書発行");
    expect(stripEmoji("Cmd+K で素早く移動・検索")).toBe("Cmd+K で素早く移動・検索");
  });
});
