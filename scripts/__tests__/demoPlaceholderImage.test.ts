import { describe, expect, it } from "vitest";
import { generateDemoPlaceholderJpeg } from "../demoPlaceholderImage";

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
