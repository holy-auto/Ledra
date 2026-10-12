import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { demoPhotoFor, generateDemoPlaceholderJpeg } from "../demoPlaceholderImage";

describe("generateDemoPlaceholderJpeg", () => {
  it("有効な非空の JPEG を返す (SOI マーカー FF D8)", async () => {
    const buf = await generateDemoPlaceholderJpeg();
    expect(buf.length).toBeGreaterThan(0);
    // JPEG は必ず FF D8 で始まる。壊れたバッファを Storage に上げると
    // <img> が再び 400/描画不能になるので、magic byte を検証する。
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
  });
});

describe("demoPhotoFor", () => {
  const dir = mkdtempSync(join(tmpdir(), "demo-photos-"));
  mkdirSync(join(dir, "coating"));
  for (const n of ["02", "01", "03"]) writeFileSync(join(dir, "coating", `${n}.jpg`), n);
  writeFileSync(join(dir, "coating", "notes.txt"), "x");

  it("種類フォルダの写真をファイル名順に、枚数で循環して返す（負数は末尾から）", async () => {
    const at = async (i: number) => (await demoPhotoFor("LEDRA-DEMO-0001", i, dir)).toString();
    expect(await Promise.all([0, 1, 2, 3, -1].map(at))).toEqual(["01", "02", "03", "01", "03"]);
  });

  it("写真が無い種類・未登録の証明書はプレースホルダ JPEG", async () => {
    for (const id of ["LEDRA-DEMO-0003", "LEDRA-DEMO-9999"]) {
      const buf = await demoPhotoFor(id, 0, dir);
      expect([buf[0], buf[1]]).toEqual([0xff, 0xd8]);
    }
  });
});
