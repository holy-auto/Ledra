import { describe, it, expect } from "vitest";
import {
  aggregateCertificateImageIntegrity,
  applyVisionVerdicts,
  computeIntegritySignature,
  pickGrayZoneImageIds,
  type CertImageIntegrityInput,
} from "@/lib/ai/certificatePhotoIntegrity";

const NOW = new Date("2026-06-03T00:00:00Z");

function img(overrides: Partial<CertImageIntegrityInput> & { id: string }): CertImageIntegrityInput {
  return {
    sha256: `sha-${overrides.id}`,
    perceptualHash: `ph-${overrides.id}`,
    capturedAt: "2026-06-01T10:00:00Z",
    // 既定はアップロードが撮影の当日〜翌日 (= stale ではない正常ケース)。
    uploadedAt: "2026-06-02T00:00:00Z",
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

  it("アップロードより大幅に前の撮影は capture_time_stale で inconclusive (使い回し疑い)", () => {
    // アップロード = 2026-06-01、撮影 = 2026-01-01 (約5ヶ月前 > 60日) → 使い回しの疑い。
    const r = aggregateCertificateImageIntegrity([
      img({ id: "1", capturedAt: "2026-01-01T10:00:00Z", uploadedAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(r.flags).toContain("capture_time_stale");
    // 使い回しは弱いシグナル → suspicious にはしない (Vision へ回す)。
    expect(r.verdict).toBe("inconclusive");
    expect(r.anyFlagged).toBe(false);
    expect(pickGrayZoneImageIds(r, 10)).toContain("1");
    // 要約はメタ欠落ではなく使い回しの疑いを明示する。
    expect(r.summary).toContain("使い回し");
    expect(r.summary).not.toContain("撮影メタ");
  });

  it("アップロード直近 (60日以内) の撮影は stale にしない", () => {
    const r = aggregateCertificateImageIntegrity([
      img({ id: "1", capturedAt: "2026-05-20T10:00:00Z", uploadedAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(r.flags).not.toContain("capture_time_stale");
    expect(r.verdict).toBe("clear");
  });

  it("uploadedAt 未指定なら stale 判定はスキップ (誤検知回避)", () => {
    const r = aggregateCertificateImageIntegrity([
      img({ id: "1", capturedAt: "2020-01-01T10:00:00Z", uploadedAt: null }),
    ]);
    expect(r.flags).not.toContain("capture_time_stale");
    expect(r.verdict).toBe("clear");
  });

  it("未来の撮影は stale ではなく capture_time_future を優先", () => {
    const r = aggregateCertificateImageIntegrity([
      img({ id: "1", capturedAt: "2026-12-31T00:00:00Z", uploadedAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(r.flags).toContain("capture_time_future");
    expect(r.flags).not.toContain("capture_time_stale");
    expect(r.verdict).toBe("suspicious");
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

describe("Vision エスカレーション (グレーゾーン抽出 / 結果折り込み)", () => {
  // clear (正常) + inconclusive (メタ欠落) + suspicious (重複) の混在を作る。
  function mixed() {
    return aggregateCertificateImageIntegrity(
      [
        img({ id: "clear" }),
        img({ id: "gray", capturedAt: null, deviceModel: null }),
        img({ id: "dupA", sha256: "DUP" }),
        img({ id: "dupB", sha256: "DUP" }),
      ],
      NOW,
    );
  }

  it("pickGrayZoneImageIds は inconclusive だけを返す (clear/suspicious は除外)", () => {
    const ids = pickGrayZoneImageIds(mixed(), 10);
    expect(ids).toEqual(["gray"]);
  });

  it("pickGrayZoneImageIds は maxN で打ち切る", () => {
    const s = aggregateCertificateImageIntegrity(
      [
        img({ id: "g1", capturedAt: null, deviceModel: null }),
        img({ id: "g2", capturedAt: null, deviceModel: null }),
        img({ id: "g3", capturedAt: null, deviceModel: null }),
      ],
      NOW,
    );
    expect(pickGrayZoneImageIds(s, 2)).toEqual(["g1", "g2"]);
  });

  it("Vision suspicious はグレー画像を suspicious に格上げする", () => {
    const before = mixed();
    expect(before.perImage.find((p) => p.imageId === "gray")?.verdict).toBe("inconclusive");
    const after = applyVisionVerdicts(before, { gray: { suspicious: true } });
    const gray = after.perImage.find((p) => p.imageId === "gray");
    expect(gray?.verdict).toBe("suspicious");
    expect(gray?.flags).toContain("vision_suspicious");
    expect(after.flags).toContain("vision_suspicious");
    // 重複の 2 枚 + Vision の 1 枚 = 3 枚 suspicious。
    expect(after.suspiciousCount).toBe(3);
  });

  it("Vision clear はグレー画像を inconclusive のまま据え置く", () => {
    const before = mixed();
    const after = applyVisionVerdicts(before, { gray: { suspicious: false } });
    expect(after.perImage.find((p) => p.imageId === "gray")?.verdict).toBe("inconclusive");
    expect(after.flags).not.toContain("vision_suspicious");
  });

  it("signature は Vision 折り込み後も不変 (写真集合に依存)", () => {
    const before = mixed();
    const after = applyVisionVerdicts(before, { gray: { suspicious: true } });
    expect(after.signature).toBe(before.signature);
  });
});
