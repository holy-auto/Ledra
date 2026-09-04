/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/certificateImages", () => ({ CERTIFICATE_IMAGE_BUCKET: "assets" }));
vi.mock("@/lib/anchoring/imageHashing", () => ({
  hashSha256: vi.fn(() => "a".repeat(64)),
  computePerceptualHash: vi.fn(async () => "deadbeefdeadbeef"),
}));
vi.mock("@/lib/ai/photoTamperingCheck", () => ({ extractExifMeta: vi.fn(), detectExifFlags: vi.fn() }));
vi.mock("@/lib/anchoring/imageExif", () => ({ stripGpsAndReadExif: vi.fn() }));
vi.mock("@/lib/parts/evidenceTsa", () => ({ requestEvidenceTimestamp: vi.fn() }));

import { stageInstallationPhoto } from "@/lib/parts/evidenceService";
import { extractExifMeta, detectExifFlags } from "@/lib/ai/photoTamperingCheck";
import { hashSha256 } from "@/lib/anchoring/imageHashing";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";
import { requestEvidenceTimestamp } from "@/lib/parts/evidenceTsa";

const exifMock = vi.mocked(extractExifMeta);
const flagsMock = vi.mocked(detectExifFlags);
const stripMock = vi.mocked(stripGpsAndReadExif);
const hashMock = vi.mocked(hashSha256);
const tsaMock = vi.mocked(requestEvidenceTimestamp);

const STRIPPED = Buffer.from("gps-removed-bytes");

function makeAdmin(opts: { uploadError?: { message: string } } = {}) {
  const uploaded: string[] = [];
  const uploadedBuffers: unknown[] = [];
  const admin = {
    storage: {
      from: () => ({
        upload: (path: string, body: unknown) => {
          uploaded.push(path);
          uploadedBuffers.push(body);
          return Promise.resolve({ error: opts.uploadError ?? null });
        },
      }),
    },
  };
  return { admin: admin as any, uploaded, uploadedBuffers };
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
    stripMock.mockReset();
    // Default: strip succeeds and returns GPS-removed bytes.
    stripMock.mockResolvedValue({
      strippedBuffer: STRIPPED,
      capturedAt: null,
      deviceModel: null,
      gpsStripped: true,
      reencoded: true,
      orientationApplied: false,
      metadataRemoved: false,
      gps: null,
    });
    hashMock.mockClear();
    tsaMock.mockReset();
    tsaMock.mockResolvedValue(null); // default: TSA disabled/no-op
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
    expect(res.tsa_authority).toBeNull();
    expect(res.tsa_timestamp_at).toBeNull();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(/^parts\/t1\/staging\/install_photo-\d+-aaaaaaaa\.jpg$/);
  });

  it("seals the stored-bytes hash with TSA when PARTS_TSA is enabled, without upgrading the grade", async () => {
    exifMock.mockResolvedValue(exif({ takenAt: new Date("2026-06-01T10:00:00Z"), hasExif: true }) as any);
    tsaMock.mockResolvedValueOnce({
      token: Buffer.from("der"),
      authority: "tsa.example.com",
      timestampAt: "2026-06-01T10:00:01.000Z",
    });
    const { admin } = makeAdmin();

    const res = await stageInstallationPhoto({ admin, ...baseArgs() });

    expect(res.tsa_authority).toBe("tsa.example.com");
    expect(res.tsa_timestamp_at).toBe("2026-06-01T10:00:01.000Z");
    // TSA alone (no device attestation / nonce binding) never upgrades past basic.
    expect(res.authenticity_grade).toBe("basic");
    // Sealed over the stored (post-GPS-strip) hash, matching what's actually persisted.
    expect(tsaMock).toHaveBeenCalledWith("a".repeat(64));
  });

  it("degrades to no-seal (tsa fields null) when TSA is disabled/fails, without blocking the upload", async () => {
    exifMock.mockResolvedValue(exif({ hasExif: true }) as any);
    tsaMock.mockResolvedValueOnce(null);
    const { admin, uploaded } = makeAdmin();

    const res = await stageInstallationPhoto({ admin, ...baseArgs() });

    expect(res.tsa_authority).toBeNull();
    expect(res.tsa_timestamp_at).toBeNull();
    expect(uploaded).toHaveLength(1);
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

  it("strips GPS before storage and hashes the stored (stripped) bytes, not the original", async () => {
    exifMock.mockResolvedValue(exif({ hasExif: true, latitude: 0, longitude: 0 }) as any);
    const { admin, uploadedBuffers } = makeAdmin();

    await stageInstallationPhoto({ admin, ...baseArgs() });

    // Tampering detection still runs on the ORIGINAL arrayBuffer (GPS visible).
    expect(exifMock).toHaveBeenCalledOnce();
    // The bytes written to storage are the GPS-removed ones, never the raw buffer.
    expect(uploadedBuffers[0]).toBe(STRIPPED);
    // sha256 is computed over the stored (stripped) bytes so content_hash matches the file.
    expect(hashMock).toHaveBeenCalledWith(STRIPPED);
  });

  it("throws when the storage upload fails", async () => {
    exifMock.mockResolvedValue(exif() as any);
    const { admin } = makeAdmin({ uploadError: { message: "boom" } });

    await expect(stageInstallationPhoto({ admin, ...baseArgs() })).rejects.toThrow(/storage upload failed/);
  });
});
