/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  MIN_CERTIFICATE_PHOTOS,
  countCertificatePhotos,
  certificateHasRequiredPhotos,
  requiresBeforeAfterMedia,
  certificateHasRequiredBeforeAfterMedia,
} from "@/lib/certificates/photoRequirement";

/** certificate_images/certificate_media の count クエリだけを返す最小の admin スタブ。 */
function fakeAdmin(count: number | null, error: unknown = null) {
  const result = Promise.resolve({ count, error });
  const chain = { eq: () => chain, then: result.then.bind(result) };
  return {
    from: () => ({
      select: () => chain,
    }),
  } as any;
}

describe("photoRequirement", () => {
  it("MIN は 1 枚", () => {
    expect(MIN_CERTIFICATE_PHOTOS).toBe(1);
  });

  it("countCertificatePhotos は count を返す", async () => {
    expect(await countCertificatePhotos(fakeAdmin(3), "c1")).toBe(3);
  });

  it("countCertificatePhotos は count=null を 0 として扱う", async () => {
    expect(await countCertificatePhotos(fakeAdmin(null), "c1")).toBe(0);
  });

  it("countCertificatePhotos は error を throw する", async () => {
    await expect(countCertificatePhotos(fakeAdmin(null, { message: "boom" }), "c1")).rejects.toBeTruthy();
  });

  it("certificateHasRequiredPhotos: 0 枚 → false", async () => {
    expect(await certificateHasRequiredPhotos(fakeAdmin(0), "c1")).toBe(false);
  });

  it("certificateHasRequiredPhotos: 1 枚 → true", async () => {
    expect(await certificateHasRequiredPhotos(fakeAdmin(1), "c1")).toBe(true);
  });

  it("certificateHasRequiredPhotos: 複数枚 → true", async () => {
    expect(await certificateHasRequiredPhotos(fakeAdmin(5), "c1")).toBe(true);
  });

  describe("requiresBeforeAfterMedia", () => {
    it("coating / ppf は必須", () => {
      expect(requiresBeforeAfterMedia("coating")).toBe(true);
      expect(requiresBeforeAfterMedia("ppf")).toBe(true);
    });

    it("それ以外/未設定は不要", () => {
      expect(requiresBeforeAfterMedia("inspection")).toBe(false);
      expect(requiresBeforeAfterMedia(null)).toBe(false);
      expect(requiresBeforeAfterMedia(undefined)).toBe(false);
    });
  });

  describe("certificateHasRequiredBeforeAfterMedia", () => {
    it("coating で 0 件 → false", async () => {
      expect(await certificateHasRequiredBeforeAfterMedia(fakeAdmin(0), "c1", "coating")).toBe(false);
    });

    it("ppf で 1 件以上 → true", async () => {
      expect(await certificateHasRequiredBeforeAfterMedia(fakeAdmin(1), "c1", "ppf")).toBe(true);
    });

    it("対象外の service_type は 0 件でも true", async () => {
      expect(await certificateHasRequiredBeforeAfterMedia(fakeAdmin(0), "c1", "inspection")).toBe(true);
    });
  });
});
