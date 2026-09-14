import { describe, it, expect } from "vitest";
import {
  DEVICE_PLATFORMS,
  DEVICE_STATUSES,
  DEVICE_TRUST_LEVELS,
  deviceTrustLevel,
  canRevoke,
  revokeDevice,
  type UserDevice,
} from "../devices";

const NOW = "2026-08-19T00:00:00Z";
const LATER = "2026-08-19T01:00:00Z";

function makeDevice(overrides: Partial<UserDevice> = {}): UserDevice {
  return {
    id: "dev-1",
    userId: "user-1",
    deviceName: "Chrome on Mac",
    platform: "web",
    status: "active",
    registeredAt: NOW,
    lastSeenAt: NOW,
    ...overrides,
  };
}

describe("constants", () => {
  it("defines valid platforms", () => {
    expect(DEVICE_PLATFORMS).toEqual(["web", "ios", "android"]);
  });

  it("defines valid statuses", () => {
    expect(DEVICE_STATUSES).toEqual(["active", "revoked"]);
  });

  it("defines trust levels", () => {
    expect(DEVICE_TRUST_LEVELS).toEqual(["unknown", "recognized", "trusted"]);
  });
});

describe("deviceTrustLevel()", () => {
  it("returns 'unknown' for null", () => {
    expect(deviceTrustLevel(null)).toBe("unknown");
  });

  it("returns 'unknown' for revoked device", () => {
    expect(deviceTrustLevel(makeDevice({ status: "revoked" }))).toBe("unknown");
  });

  it("returns 'recognized' for active device without passkey", () => {
    expect(deviceTrustLevel(makeDevice())).toBe("recognized");
  });

  it("returns 'trusted' for active device with passkey", () => {
    expect(deviceTrustLevel(makeDevice({ credentialId: "cred-1" }))).toBe("trusted");
  });
});

describe("canRevoke()", () => {
  it("allows revoking active devices", () => {
    expect(canRevoke(makeDevice())).toBe(true);
  });

  it("disallows revoking already-revoked devices", () => {
    expect(canRevoke(makeDevice({ status: "revoked" }))).toBe(false);
  });
});

describe("revokeDevice()", () => {
  it("revokes an active device", () => {
    const device = makeDevice();
    const result = revokeDevice(device, "admin", LATER);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("revoked");
    expect(result!.revokedAt).toBe(LATER);
    expect(result!.revokeReason).toBe("admin");
    // Original not mutated
    expect(device.status).toBe("active");
  });

  it("returns null for already-revoked device", () => {
    const device = makeDevice({ status: "revoked" });
    expect(revokeDevice(device, "user", LATER)).toBeNull();
  });

  it("supports all revoke reasons", () => {
    for (const reason of ["user", "admin", "suspicious"] as const) {
      const result = revokeDevice(makeDevice(), reason, LATER);
      expect(result!.revokeReason).toBe(reason);
    }
  });
});
