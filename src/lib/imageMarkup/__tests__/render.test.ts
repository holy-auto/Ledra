import { describe, it, expect } from "vitest";
import { renderAnnotatedImage } from "../render";
import type { AnnotationDocument } from "@/components/imageMarkup/types";

/**
 * sharp を用いた焼き込み合成の動作確認。
 * - 入力は単色 PNG (sharp で動的生成)。
 * - 注釈を適用すると "原画像と異なるバイト列" になることを確認する。
 * - スナップショットは合成バイト列が "存在し、長さがゼロでない" ところまで。
 */

async function makeSolidPng(width: number, height: number, rgba: [number, number, number, number]): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 },
    },
  })
    .png()
    .toBuffer();
}

describe("renderAnnotatedImage", () => {
  it("returns a JPEG when input is JPEG-shaped (heic input falls back to jpeg too)", async () => {
    const src = await makeSolidPng(64, 48, [200, 30, 30, 255]);
    const doc: AnnotationDocument = {
      version: 1,
      imageWidth: 64,
      imageHeight: 48,
      annotations: [{ id: "r1", kind: "rect", color: "#00ff00", strokeWidth: 4, x: 4, y: 4, width: 56, height: 40 }],
    };
    const out = await renderAnnotatedImage(src, "image/heic", doc);
    expect(out.contentType).toBe("image/jpeg");
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
    expect(out.buffer.length).toBeGreaterThan(0);
    // JPEG SOI (Start Of Image) magic bytes
    expect(out.buffer[0]).toBe(0xff);
    expect(out.buffer[1]).toBe(0xd8);
  });

  it("preserves PNG when source is PNG", async () => {
    const src = await makeSolidPng(32, 32, [10, 10, 10, 255]);
    const doc: AnnotationDocument = {
      version: 1,
      imageWidth: 32,
      imageHeight: 32,
      annotations: [{ id: "c1", kind: "circle", color: "#ff3b30", strokeWidth: 2, cx: 16, cy: 16, radius: 10 }],
    };
    const out = await renderAnnotatedImage(src, "image/png", doc);
    expect(out.contentType).toBe("image/png");
    // PNG signature
    expect(out.buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("changes the output bytes vs the original (annotations are visible)", async () => {
    const src = await makeSolidPng(40, 40, [255, 255, 255, 255]);
    const docEmpty: AnnotationDocument = { version: 1, imageWidth: 40, imageHeight: 40, annotations: [] };
    const docFull: AnnotationDocument = {
      version: 1,
      imageWidth: 40,
      imageHeight: 40,
      annotations: [
        {
          id: "p1",
          kind: "path",
          color: "#000000",
          strokeWidth: 4,
          points: [2, 2, 38, 38, 2, 38],
        },
      ],
    };
    const a = await renderAnnotatedImage(src, "image/png", docEmpty);
    const b = await renderAnnotatedImage(src, "image/png", docFull);
    expect(b.buffer.equals(a.buffer)).toBe(false);
  });

  // ponytail: WEBP エンコードは他形式より CPU 負荷が高く、CI ランナーが混んでいる
  // ときに既定の 5000ms を超えることがある（本テスト自体は 450ms 程度で終わる）。
  // タイムアウトだけ緩め、ロジックは変えない。
  it("keeps WEBP when source is webp", async () => {
    const { default: sharp } = await import("sharp");
    const src = await sharp({
      create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .webp()
      .toBuffer();
    const doc: AnnotationDocument = {
      version: 1,
      imageWidth: 32,
      imageHeight: 32,
      annotations: [
        { id: "t1", kind: "text", color: "#ff0000", strokeWidth: 1, x: 4, y: 24, text: "OK", fontSize: 16 },
      ],
    };
    const out = await renderAnnotatedImage(src, "image/webp", doc);
    expect(out.contentType).toBe("image/webp");
  }, 15000);
});
