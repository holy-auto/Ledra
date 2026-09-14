import { describe, expect, it } from "vitest";
import { buildC2paManifestSummary } from "../c2pa";

describe("buildC2paManifestSummary", () => {
  it("records the signer mode and the fixed actions ledger", () => {
    const s = buildC2paManifestSummary("production");
    expect(s.signerMode).toBe("production");
    expect(s.claimGenerator).toBe("Ledra/1.0");
    expect(s.title).toBe("Certificate Photo");
    // 実アサーションと同じ台帳。先頭は C2PA 2.x 準拠のため c2pa.created。
    // EXIF/GPS 除去は parameters.name 付きで要約される。
    expect(s.actions).toEqual([
      "c2pa.created",
      "c2pa.orientation",
      "c2pa.converted",
      "c2pa.edited:exif_gps_metadata_removed",
    ]);
  });

  it("asserts only the actions that actually had an effect (no no-ops)", () => {
    // Re-encode ran, but the source had no orientation and no metadata to remove:
    // only created + converted, and allActionsIncluded stays true.
    const reencodeOnly = buildC2paManifestSummary("production", undefined, {
      reencoded: true,
      orientationApplied: false,
      metadataRemoved: false,
    });
    expect(reencodeOnly.actions).toEqual(["c2pa.created", "c2pa.converted"]);
    expect(reencodeOnly.allActionsIncluded).toBe(true);

    // Fallback: sharp failed, original signed as-is → only created, not complete.
    const fallback = buildC2paManifestSummary("production", undefined, {
      reencoded: false,
      orientationApplied: false,
      metadataRemoved: false,
    });
    expect(fallback.actions).toEqual(["c2pa.created"]);
    expect(fallback.allActionsIncluded).toBe(false);
  });

  it("summarizes the sealed binding and keeps the nonce as a boolean only (never the raw value)", () => {
    const s = buildC2paManifestSummary("dev-signed", {
      publicId: "cert_abc",
      vin: "JHMFA1",
      captureNonce: "super-secret-nonce",
      tsaTimestamp: "2026-06-01T10:00:01.000Z",
    });
    expect(s.binding.certPublicId).toBe("cert_abc");
    expect(s.binding.vin).toBe("JHMFA1");
    expect(s.binding.tsaTimestamp).toBe("2026-06-01T10:00:01.000Z");
    expect(s.binding.nonceSealed).toBe(true);
    // 生の nonce はどこにも現れない。
    expect(JSON.stringify(s)).not.toContain("super-secret-nonce");
  });

  it("nulls out empty/whitespace binding fields and reports nonceSealed=false when absent", () => {
    const s = buildC2paManifestSummary("dev-signed", {
      publicId: "  ",
      vin: null,
      captureNonce: "   ",
      tsaTimestamp: null,
    });
    expect(s.binding.certPublicId).toBeNull();
    expect(s.binding.vin).toBeNull();
    expect(s.binding.tsaTimestamp).toBeNull();
    expect(s.binding.nonceSealed).toBe(false);
  });

  it("handles no binding at all", () => {
    const s = buildC2paManifestSummary("production");
    expect(s.binding).toEqual({ certPublicId: null, vin: null, tsaTimestamp: null, nonceSealed: false });
  });
});
