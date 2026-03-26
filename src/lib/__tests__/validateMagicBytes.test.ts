import { describe, it, expect } from "vitest";

/**
 * Inline copy of validateMagicBytes from
 * src/app/api/certificates/images/upload/route.ts
 * (not exported, so we duplicate for unit testing)
 */
function validateMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return "image/png";
  }
  // WebP: RIFF ... WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return "image/webp";
  }
  // HEIF/HEIC: ftyp box at offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "mif1"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

describe("validateMagicBytes", () => {
  it("detects JPEG files", () => {
    const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateMagicBytes(buf)).toBe("image/jpeg");
  });

  it("detects PNG files", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
    expect(validateMagicBytes(buf)).toBe("image/png");
  });

  it("detects WebP files", () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(validateMagicBytes(buf)).toBe("image/webp");
  });

  it("detects HEIC files (heic brand)", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    buf.write("heic", 8, "ascii");
    expect(validateMagicBytes(buf)).toBe("image/heic");
  });

  it("detects HEIC files (heix brand)", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    buf.write("heix", 8, "ascii");
    expect(validateMagicBytes(buf)).toBe("image/heic");
  });

  it("detects HEIC files (hevc brand)", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    buf.write("hevc", 8, "ascii");
    expect(validateMagicBytes(buf)).toBe("image/heic");
  });

  it("detects HEIC files (mif1 brand)", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    buf.write("mif1", 8, "ascii");
    expect(validateMagicBytes(buf)).toBe("image/heic");
  });

  it("rejects ftyp with unknown brand", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    buf.write("mp41", 8, "ascii");
    expect(validateMagicBytes(buf)).toBeNull();
  });

  it("rejects unknown files", () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(validateMagicBytes(buf)).toBeNull();
  });

  it("rejects files with fake MIME but wrong magic bytes (PE/MZ header)", () => {
    const buf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    expect(validateMagicBytes(buf)).toBeNull();
  });

  it("rejects buffers shorter than 12 bytes", () => {
    const buf = Buffer.from([0xFF, 0xD8, 0xFF]);
    expect(validateMagicBytes(buf)).toBeNull();
  });

  it("rejects empty buffer", () => {
    const buf = Buffer.alloc(0);
    expect(validateMagicBytes(buf)).toBeNull();
  });

  it("rejects buffer of exactly 11 bytes", () => {
    const buf = Buffer.alloc(11, 0xFF);
    expect(validateMagicBytes(buf)).toBeNull();
  });
});
