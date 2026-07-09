import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { rpIdHash, parseAuthData, computeAttestationNonce, APP_ATTEST_AAGUID, verifyAppAttest } from "../appAttest";
import { verifyDeviceAttestation, normalizeAttestationProvider } from "../deviceAttestation";
import { verifyPlayIntegrity } from "../playIntegrity";

describe("appAttest pure helpers", () => {
  it("rpIdHash = SHA256('TEAMID.bundleID')", () => {
    const got = rpIdHash("ABCDE12345", "com.ledra.app");
    const want = createHash("sha256").update("ABCDE12345.com.ledra.app").digest();
    expect(got.equals(want)).toBe(true);
  });

  it("computeAttestationNonce = SHA256(authData || clientDataHash)", () => {
    const authData = Buffer.from("auth-data-bytes");
    const clientDataHash = createHash("sha256").update("challenge-nonce").digest();
    const got = computeAttestationNonce(authData, clientDataHash);
    const want = createHash("sha256")
      .update(Buffer.concat([authData, clientDataHash]))
      .digest();
    expect(got.equals(want)).toBe(true);
  });

  it("parseAuthData reads the fixed layout and slices the credentialId", () => {
    const credId = Buffer.from("keyid-abc"); // 9 bytes
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(credId.length, 0);
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(7, 0);
    const authData = Buffer.concat([
      Buffer.alloc(32, 0xaa), // rpIdHash
      Buffer.from([0x40]), // flags
      signCount,
      APP_ATTEST_AAGUID.development, // 16-byte aaguid
      credIdLen,
      credId,
    ]);

    const parsed = parseAuthData(authData);
    expect(parsed).not.toBeNull();
    expect(parsed!.flags).toBe(0x40);
    expect(parsed!.signCount).toBe(7);
    expect(parsed!.aaguid.equals(APP_ATTEST_AAGUID.development)).toBe(true);
    expect(parsed!.credentialId.equals(credId)).toBe(true);
  });

  it("parseAuthData rejects a truncated buffer", () => {
    expect(parseAuthData(Buffer.alloc(10))).toBeNull();
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(100, 0); // claims 100 bytes that aren't there
    const truncated = Buffer.concat([Buffer.alloc(53), credIdLen]); // no credentialId
    expect(parseAuthData(truncated)).toBeNull();
  });

  it("aaguid differs between production and development", () => {
    expect(APP_ATTEST_AAGUID.production.equals(APP_ATTEST_AAGUID.development)).toBe(false);
    expect(APP_ATTEST_AAGUID.production.length).toBe(16);
    expect(APP_ATTEST_AAGUID.development.length).toBe(16);
  });
});

describe("verifyAppAttest fail-closed config guards", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("fails when team/bundle not configured", async () => {
    delete process.env.APP_ATTEST_TEAM_ID;
    delete process.env.APP_ATTEST_BUNDLE_ID;
    const r = await verifyAppAttest("{}", "nonce");
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("app_attest_not_configured");
  });

  it("fails when root CA missing even if team/bundle set", async () => {
    process.env.APP_ATTEST_TEAM_ID = "ABCDE12345";
    process.env.APP_ATTEST_BUNDLE_ID = "com.ledra.app";
    delete process.env.APP_ATTEST_ROOT_CA_PEM;
    const r = await verifyAppAttest("{}", "nonce");
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("app_attest_root_ca_missing");
  });
});

describe("verifyPlayIntegrity fail-closed config guards", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("fails when package name not configured", async () => {
    delete process.env.PLAY_INTEGRITY_PACKAGE_NAME;
    const r = await verifyPlayIntegrity("token", "nonce");
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("play_integrity_not_configured");
  });

  it("fails without a nonce to bind", async () => {
    process.env.PLAY_INTEGRITY_PACKAGE_NAME = "com.ledra.app";
    const r = await verifyPlayIntegrity("token", null);
    expect(r.verified).toBe(false);
    expect(r.reason).toBe("missing_nonce");
  });
});

describe("verifyDeviceAttestation dispatch", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is fail-closed when attestation is disabled", async () => {
    delete process.env.DEVICE_ATTESTATION_ENABLED;
    const r = await verifyDeviceAttestation("token", { provider: "play_integrity", expectedNonce: "n" });
    expect(r).toEqual({ provider: "none", verified: false, deviceKeyHash: null, reason: "attestation_disabled" });
  });

  it("fails with missing_token when enabled but no token", async () => {
    process.env.DEVICE_ATTESTATION_ENABLED = "true";
    const r = await verifyDeviceAttestation(undefined, { provider: "play_integrity", expectedNonce: "n" });
    expect(r.reason).toBe("missing_token");
    expect(r.verified).toBe(false);
  });

  it("rejects an unknown provider", async () => {
    process.env.DEVICE_ATTESTATION_ENABLED = "true";
    const r = await verifyDeviceAttestation("token", { provider: "webauthn", expectedNonce: "n" });
    expect(r.reason).toBe("unknown_provider");
    expect(r.verified).toBe(false);
  });

  it("normalizeAttestationProvider narrows to the known enum", () => {
    expect(normalizeAttestationProvider("play_integrity")).toBe("play_integrity");
    expect(normalizeAttestationProvider("app_attest")).toBe("app_attest");
    expect(normalizeAttestationProvider("nonsense")).toBe("none");
    expect(normalizeAttestationProvider(null)).toBe("none");
  });
});
