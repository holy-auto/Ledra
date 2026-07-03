import { describe, it, expect } from "vitest";
import { detectMagicByteMime } from "./magicBytes";

/** 先頭バイトを与え、残りをゼロ埋めした 16 バイトの Buffer を作る。 */
const buf = (...bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);
/** offset 4 に 'ftyp' + brand を置いた ISO BMFF ヘッダ。 */
const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]), Buffer.from(brand, "ascii"), Buffer.alloc(8)]);

describe("detectMagicByteMime", () => {
  it("detects known-good headers", () => {
    expect(detectMagicByteMime(buf(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(detectMagicByteMime(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectMagicByteMime(buf(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
    expect(detectMagicByteMime(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
    expect(detectMagicByteMime(ftyp("heic"))).toBe("image/heic");
    expect(detectMagicByteMime(ftyp("isom"))).toBe("video/mp4");
    expect(detectMagicByteMime(ftyp("qt  "))).toBe("video/quicktime");
  });

  it("rejects spoofed / unknown headers and short buffers", () => {
    // 拡張子だけ画像でも中身が別物なら null (client MIME なりすまし対策)。
    expect(detectMagicByteMime(buf(0x00, 0x01, 0x02, 0x03))).toBeNull();
    // PNG シグネチャの途中バイトが壊れていれば null。
    expect(detectMagicByteMime(buf(0x89, 0x50, 0x4e, 0x47, 0x00))).toBeNull();
    // 12 バイト未満は判定不能。
    expect(detectMagicByteMime(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
