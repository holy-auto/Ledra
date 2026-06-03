import { describe, it, expect } from "vitest";
import {
  aggregateCertificateImageIntegrity,
  computeIntegritySignature,
  type CertImageIntegrityInput,
} from "@/lib/ai/certificatePhotoIntegrity";

const NOW = new Date("2026-06-03T00:00:00Z");

function img(overrides: Partial<CertImageIntegrityInput> & { id: string }): CertImageIntegrityInput {
  return {
    sha256: `sha-${overrides.id}`,
    perceptualHash: `ph-${overrides.id}`,
    capturedAt: "2026-06-01T10:00:00Z",
    deviceModel: "Apple iPhone 15",
    deepfakeVerdict: "likely_real",
    authenticityGrade: "A",
    ...overrides,
  };
}

describe("aggregateCertificateImageIntegrity", () => {
  it("写真なしは inconclusive / signature 空", () => {
    const r = aggregateCertificateImageIntegrity([], NOW);
    expect(r.verdict).toBe("inconclusive");
    expect(r.imageCount).toBe(0);
    expect(r.anyFlagged).toBe(false);
    expect(r.signature).toBe("");
  });

  it("正常な複数写真は clear", () => {
    const r = aggregateCertificateImageIntegrity([img({ id: "1" }), img({ id: "2" })], NOW);
    expect(r.verdict).toBe("clear");
    expect(r.anyFlagged).toBe(false);
    expect(r.suspiciousCount).toBe(0);
    expect(r.flags).toEqual([]);
  });

  it("同一 sha256 の重複は duplicate_image で suspicious", () => {
    const r = aggregateCertificateImageIntegrity(
      [img({ id: "1", sha256: "DUP" }), img({ id: "2", sha256: "DUP" })],
      NOW,
    );
    expect(r.verdict).toBe("suspicious");
    expect(r.suspiciousCount).toBe(2);
    expect(r.flags).toContain("duplicate_image");
  });

  it("同一 perceptual_hash の重複 (sha 異なる) も duplicate_image", () => {
    const r = aggregateCertificateImageIntegrity(
      [img({ id: "1", perceptualHash: "PH" }), img({ id: "2", perceptualHash: "PH" })],
      NOW,
    );
    expect(r.flags).toContain("duplicate_image");
    expect(r.verdict).toBe("suspicious");
  });

  it("deepfake likely_fake は suspicious", () => {
    const r = aggregateCertificateImageIntegrity([img({ id: "1", deepfakeVerdict: "likely_fake" })], NOW);
    expect(r.verdict).toBe("suspicious");
    expect(r.flags).toContain("deepfake_suspected");
  });

  it("撮影日時が未来は capture_time_future で suspicious", () => {
    const r = aggregateCertificateImageIntegrity([img({ id: "1", capturedAt: "2026-12-31T00:00:00Z" })], NOW);
    expect(r.verdict).toBe("suspicious");
    expect(r.flags).toContain("capture_time_future");
  });

  it("撮影メタ欠落のみは inconclusive (suspicious にしない)", () => {
    const r = aggregateCertificateImageIntegrity([img({ id: "1", capturedAt: null, deviceModel: null })], NOW);
    expect(r.verdict).toBe("inconclusive");
    expect(r.anyFlagged).toBe(false);
    expect(r.flags).toContain("metadata_missing");
  });

  it("signature は同じ写真集合で安定し、集合が変わると変化する", () => {
    const a = [img({ id: "1" }), img({ id: "2" })];
    const b = [img({ id: "2" }), img({ id: "1" })]; // 順序違い
    const c = [img({ id: "1" }), img({ id: "3" })]; // 集合違い
    expect(computeIntegritySignature(a)).toBe(computeIntegritySignature(b));
    expect(computeIntegritySignature(a)).not.toBe(computeIntegritySignature(c));
  });
});
