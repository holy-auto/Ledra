/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/certificateImages", () => ({ CERTIFICATE_IMAGE_BUCKET: "assets" }));
vi.mock("@/lib/anchoring/imageHashing", () => ({
  hashSha256: vi.fn(() => "a".repeat(64)),
  computePerceptualHash: vi.fn(async () => "deadbeefdeadbeef"),
}));
vi.mock("@/lib/ai/photoTamperingCheck", () => ({ extractExifMeta: vi.fn() }));
vi.mock("@/lib/parts/installationService", () => ({ findDuplicateEvidence: vi.fn() }));

import { attachInstallationPhoto } from "@/lib/parts/evidenceService";
import { extractExifMeta } from "@/lib/ai/photoTamperingCheck";
import { findDuplicateEvidence } from "@/lib/parts/installationService";

const exifMock = vi.mocked(extractExifMeta);
const dupMock = vi.mocked(findDuplicateEvidence);

function makeAdmin(opts: { uploadError?: { message: string }; evidenceError?: { message: string } } = {}) {
  const uploaded: string[] = [];
  const removed: string[] = [];
  const evidenceRows: Array<Record<string, unknown>> = [];
  const findingRows: Array<Record<string, unknown>> = [];

  const admin = {
    storage: {
      from: () => ({
        upload: (path: string) => {
          uploaded.push(path);
          return Promise.resolve({ error: opts.uploadError ?? null });
        },
        remove: (paths: string[]) => {
          removed.push(...paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
    from: (table: string) => {
      if (table === "part_installation_evidence") {
        return {
          insert: (row: Record<string, unknown>) => {
            evidenceRows.push(row);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve(
                    opts.evidenceError
                      ? { data: null, error: opts.evidenceError }
                      : { data: { id: "ev1" }, error: null },
                  ),
              }),
            };
          },
        };
      }
      if (table === "part_integrity_findings") {
        return {
          insert: (row: Record<string, unknown>) => {
            findingRows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { admin: admin as any, uploaded, removed, evidenceRows, findingRows };
}

const baseArgs = () => ({
  tenantId: "t1",
  installationId: "inst1",
  kind: "install_photo" as const,
  buffer: Buffer.from("img"),
  arrayBuffer: new ArrayBuffer(8),
  mime: "image/jpeg",
});

describe("attachInstallationPhoto", () => {
  beforeEach(() => {
    exifMock.mockReset();
    dupMock.mockReset();
    dupMock.mockResolvedValue([]);
  });

  it("hashes, extracts EXIF, uploads and inserts evidence (grade basic when EXIF present)", async () => {
    exifMock.mockResolvedValue({
      takenAt: new Date("2026-06-01T10:00:00Z"),
      latitude: null,
      longitude: null,
      deviceModel: "Apple iPhone",
      software: null,
      hasExif: true,
    });
    const { admin, uploaded, evidenceRows, findingRows } = makeAdmin();

    const res = await attachInstallationPhoto({ admin, ...baseArgs() });

    expect(res.sha256).toBe("a".repeat(64));
    expect(res.perceptual_hash).toBe("deadbeefdeadbeef");
    expect(res.exif_captured_at).toBe("2026-06-01T10:00:00.000Z");
    expect(res.authenticity_grade).toBe("basic");
    expect(res.duplicate).toBe(false);
    expect(res.evidence_id).toBe("ev1");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(/^parts\/t1\/inst1\/evidence-install_photo-\d+\.jpg$/);
    expect(evidenceRows[0]).toMatchObject({
      tenant_id: "t1",
      installation_id: "inst1",
      kind: "install_photo",
      content_type: "image/jpeg",
      sha256: "a".repeat(64),
      perceptual_hash: "deadbeefdeadbeef",
      authenticity_grade: "basic",
      exif_captured_at: "2026-06-01T10:00:00.000Z",
    });
    expect(findingRows).toEqual([]);
  });

  it("marks grade unverified and null capture time when EXIF is absent", async () => {
    exifMock.mockResolvedValue({
      takenAt: null,
      latitude: null,
      longitude: null,
      deviceModel: null,
      software: null,
      hasExif: false,
    });
    const { admin } = makeAdmin();

    const res = await attachInstallationPhoto({ admin, ...baseArgs() });

    expect(res.authenticity_grade).toBe("unverified");
    expect(res.exif_captured_at).toBeNull();
  });

  it("records a photo_duplicate finding and flags duplicate when reuse is detected", async () => {
    exifMock.mockResolvedValue({
      takenAt: null,
      latitude: null,
      longitude: null,
      deviceModel: null,
      software: null,
      hasExif: false,
    });
    dupMock.mockResolvedValue([{ installation_id: "other", sha256: "a".repeat(64), perceptual_hash: null }]);
    const { admin, findingRows } = makeAdmin();

    const res = await attachInstallationPhoto({ admin, ...baseArgs() });

    expect(res.duplicate).toBe(true);
    expect(findingRows).toHaveLength(1);
    expect(findingRows[0]).toMatchObject({
      tenant_id: "t1",
      installation_id: "inst1",
      rule: "photo_duplicate",
      severity: "critical",
    });
  });

  it("throws when the storage upload fails (no evidence row)", async () => {
    exifMock.mockResolvedValue({
      takenAt: null,
      latitude: null,
      longitude: null,
      deviceModel: null,
      software: null,
      hasExif: false,
    });
    const { admin, evidenceRows } = makeAdmin({ uploadError: { message: "boom" } });

    await expect(attachInstallationPhoto({ admin, ...baseArgs() })).rejects.toThrow(/storage upload failed/);
    expect(evidenceRows).toEqual([]);
  });

  it("cleans up the uploaded object when the evidence insert fails", async () => {
    exifMock.mockResolvedValue({
      takenAt: null,
      latitude: null,
      longitude: null,
      deviceModel: null,
      software: null,
      hasExif: false,
    });
    const { admin, uploaded, removed } = makeAdmin({ evidenceError: { message: "insert fail" } });

    await expect(attachInstallationPhoto({ admin, ...baseArgs() })).rejects.toThrow(/evidence insert failed/);
    expect(removed).toEqual(uploaded);
  });
});
