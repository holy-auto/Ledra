/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/certificateImages", () => ({ CERTIFICATE_IMAGE_BUCKET: "assets" }));
vi.mock("@/lib/anchoring/imageHashing", () => ({
  hashSha256: vi.fn(() => "a".repeat(64)),
  computePerceptualHash: vi.fn(async () => "deadbeefdeadbeef"),
}));
vi.mock("@/lib/ai/photoTamperingCheck", () => ({ extractExifMeta: vi.fn(), detectExifFlags: vi.fn() }));

import { stageInstallationPhoto } from "@/lib/parts/evidenceService";
import { extractExifMeta, detectExifFlags } from "@/lib/ai/photoTamperingCheck";

const exifMock = vi.mocked(extractExifMeta);
const flagsMock = vi.mocked(detectExifFlags);

function makeAdmin(opts: { uploadError?: { message: string } } = {}) {
  const uploaded: string[] = [];
  const admin = {
    storage: {
      from: () => ({
        upload: (path: string) => {
          uploaded.push(path);
          return Promise.resolve({ error: opts.uploadError ?? null });
        },
      }),
    },
  };
  return { admin: admin as any, uploaded };
}

const baseArgs = () => ({
  tenantId: "t1",
  kind: "install_photo" as const,
  buffer: Buffer.from("img"),
  arrayBuffer: new ArrayBuffer(8),
  mime: "image/jpeg",
});

const exif = (over: Record<string, unknown> = {}) => ({
  takenAt: null,
  latitude: null,
  longitude: null,
  deviceModel: null,
  software: null,
  hasExif: false,
  ...over,
});

describe("stageInstallationPhoto", () => {
  beforeEach(() => {
    exifMock.mockReset();
    flagsMock.mockReset();
    flagsMock.mockReturnValue([]);
  });

  it("hashes, extracts EXIF, uploads to staging and returns metadata (grade basic when clean EXIF)", async () => {
    exifMock.mockResolvedValue(exif({ takenAt: new Date("2026-06-01T10:00:00Z"), hasExif: true }) as any);
    const { admin, uploaded } = makeAdmin();

    const res = await stageInstallationPhoto({ admin, ...baseArgs() });

    expect(res.sha256).toBe("a".repeat(64));
    expect(res.perceptual_hash).toBe("deadbeefdeadbeef");
    expect(res.exif_captured_at).toBe("2026-06-01T10:00:00.000Z");
    expect(res.authenticity_grade).toBe("basic");
    expect(res.integrity_flags).toEqual([]);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(/^parts\/t1\/staging\/install_photo-\d+-aaaaaaaa\.jpg$/);
  });

  it("marks grade unverified and null capture time when EXIF is absent", async () => {
    exifMock.mockResolvedValue(exif({ hasExif: false }) as any);
    flagsMock.mockReturnValue(["exif_stripped"]);
    const { admin } = makeAdmin();

    const res = await stageInstallationPhoto({ admin, ...baseArgs() });

    expect(res.authenticity_grade).toBe("unverified");
    expect(res.exif_captured_at).toBeNull();
    expect(res.integrity_flags).toEqual(["exif_stripped"]);
  });

  it("surfaces tampering flags and downgrades grade when EXIF shows edit software", async () => {
    exifMock.mockResolvedValue(exif({ hasExif: true, software: "Adobe Photoshop" }) as any);
    flagsMock.mockReturnValue(["software_edited"]);
    const { admin } = makeAdmin();

    const res = await stageInstallationPhoto({ admin, ...baseArgs() });

    // EXIF はあるが改ざん疑い flag があるので basic に上げない。
    expect(res.authenticity_grade).toBe("unverified");
    expect(res.integrity_flags).toEqual(["software_edited"]);
  });

  it("throws when the storage upload fails", async () => {
    exifMock.mockResolvedValue(exif() as any);
    const { admin } = makeAdmin({ uploadError: { message: "boom" } });

    await expect(stageInstallationPhoto({ admin, ...baseArgs() })).rejects.toThrow(/storage upload failed/);
  });
});
