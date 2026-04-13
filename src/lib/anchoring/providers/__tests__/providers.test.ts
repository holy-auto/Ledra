import { describe, it, expect, vi, beforeEach } from "vitest";

// Dynamically import so env vars take effect per-test
async function loadProviders() {
  // Clear module cache to pick up env changes
  vi.resetModules();
  return import("../index");
}

async function loadGrade() {
  vi.resetModules();
  return import("../../authenticityGrade");
}

describe("invokeAllUploadProviders", () => {
  const dummyBuffer = Buffer.from("test-image-data");

  beforeEach(() => {
    // Reset all provider env vars to disabled
    delete process.env.C2PA_MODE;
    delete process.env.DEEPFAKE_PROVIDER;
    delete process.env.DEVICE_ATTESTATION_ENABLED;
    delete process.env.POLYGON_ANCHOR_ENABLED;
  });

  it("returns safe defaults when all providers are disabled", async () => {
    const { invokeAllUploadProviders } = await loadProviders();
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    expect(result.c2pa).toEqual({ manifestCid: null, verified: false, signedBuffer: null });
    expect(result.deepfake).toEqual({ score: null, verdict: null });
    expect(result.deviceAttestation).toEqual({ provider: "none", verified: false });
    expect(result.polygon).toEqual({ txHash: null, anchored: false, network: null });
  });

  it("falls back gracefully when c2pa signing fails on non-JPEG buffer", async () => {
    process.env.C2PA_MODE = "dev-signed";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { invokeAllUploadProviders } = await loadProviders();
    // dummyBuffer is not a valid JPEG, so c2pa-node will fail
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    // Should fall back to disabled result, not throw
    expect(result.c2pa.verified).toBe(false);
    expect(result.c2pa.signedBuffer).toBeNull();

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("logs warning for unimplemented deepfake provider", async () => {
    process.env.DEEPFAKE_PROVIDER = "hive";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { invokeAllUploadProviders } = await loadProviders();
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    expect(result.deepfake).toEqual({ score: null, verdict: null });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[deepfake] provider=hive not yet implemented"));

    warnSpy.mockRestore();
  });
});

describe("signC2pa directly", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.C2PA_MODE;
  });

  it("returns disabled result when C2PA_MODE is unset", async () => {
    const { signC2pa } = await (async () => {
      vi.resetModules();
      return import("../c2pa");
    })();

    const result = await signC2pa(Buffer.from("test"), "image/jpeg");
    expect(result).toEqual({ manifestCid: null, verified: false, signedBuffer: null });
  });

  it("returns disabled result when C2PA_MODE is disabled", async () => {
    process.env.C2PA_MODE = "disabled";
    const { signC2pa } = await (async () => {
      vi.resetModules();
      return import("../c2pa");
    })();

    const result = await signC2pa(Buffer.from("test"), "image/jpeg");
    expect(result).toEqual({ manifestCid: null, verified: false, signedBuffer: null });
  });
});

describe("anchorToPolygon", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_ANCHOR_ENABLED;
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_PRIVATE_KEY;
    delete process.env.POLYGON_CONTRACT_ADDRESS;
  });

  it("returns disabled result when POLYGON_ANCHOR_ENABLED is not set", async () => {
    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(result).toEqual({ txHash: null, anchored: false, network: null });
  });

  it("returns disabled result when enabled but missing config", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    // Missing RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    expect(result).toEqual({ txHash: null, anchored: false, network: null });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[polygon] enabled but missing config"));

    warnSpy.mockRestore();
  });

  it("returns disabled result when transaction fails", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    process.env.POLYGON_RPC_URL = "https://polygon-rpc.com";
    process.env.POLYGON_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
    process.env.POLYGON_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    // Will fail because we can't actually connect to RPC in tests
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    expect(result).toEqual({ txHash: null, anchored: false, network: null });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[polygon] anchoring failed:"), expect.anything());

    errorSpy.mockRestore();
  });
});

describe("verifyAnchor", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_PRIVATE_KEY;
    delete process.env.POLYGON_CONTRACT_ADDRESS;
  });

  it("returns false when config is missing", async () => {
    vi.resetModules();
    const { verifyAnchor } = await import("../polygon");
    const result = await verifyAnchor("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(result).toBe(false);
  });
});

describe("buildExplorerUrl", () => {
  it("returns mainnet Polygonscan URL", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", "polygon")).toBe("https://polygonscan.com/tx/0xabc");
  });

  it("returns Amoy testnet Polygonscan URL", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", "amoy")).toBe("https://amoy.polygonscan.com/tx/0xabc");
  });

  it("returns null when tx hash missing", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl(null, "polygon")).toBeNull();
  });

  it("returns null when network missing", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", null)).toBeNull();
  });
});

describe("computeAuthenticityGrade with c2paKind", () => {
  it("returns basic when c2paKind is dev-signed even if hasC2pa is true", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasExif: true,
      hasC2pa: true,
      c2paKind: "dev-signed",
      deviceOk: true,
      deepfakeOk: true,
    });

    expect(grade).toBe("basic");
  });

  it("returns verified when c2paKind is production with C2PA + device OK", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasExif: true,
      hasC2pa: true,
      c2paKind: "production",
      deviceOk: true,
      deepfakeOk: null,
    });

    expect(grade).toBe("verified");
  });

  it("returns premium with production C2PA + device OK + deepfake OK", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasExif: true,
      hasC2pa: true,
      c2paKind: "production",
      deviceOk: true,
      deepfakeOk: true,
    });

    expect(grade).toBe("premium");
  });

  it("returns basic when c2paKind is omitted (backward compat)", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasExif: true,
      hasC2pa: false,
      deviceOk: false,
      deepfakeOk: null,
    });

    expect(grade).toBe("basic");
  });
});
