import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  INVITE_STATUSES,
  validateInvitation,
  validateAcceptParams,
  isAssignableRole,
  inviteExpiresAt,
  type Invitation,
} from "../invite";

const NOW = "2026-08-19T12:00:00Z";

function makeInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    tenantId: "tenant-1",
    email: "user@example.com",
    role: "staff",
    status: "pending",
    token: "abc123",
    invitedBy: "admin-user",
    createdAt: "2026-08-18T12:00:00Z",
    expiresAt: "2026-08-25T12:00:00Z", // 7 days from creation
    ...overrides,
  };
}

describe("INVITE_STATUSES", () => {
  it("has 4 statuses", () => {
    expect(INVITE_STATUSES).toEqual(["pending", "accepted", "expired", "revoked"]);
  });
});

describe("validateInvitation()", () => {
  it("returns valid for a pending invitation", () => {
    const result = validateInvitation(makeInvitation(), NOW);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.invitation.id).toBe("inv-1");
    }
  });

  it("returns not_found for null", () => {
    expect(validateInvitation(null, NOW)).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns already_accepted for accepted invitation", () => {
    const inv = makeInvitation({ status: "accepted" });
    expect(validateInvitation(inv, NOW)).toEqual({ valid: false, reason: "already_accepted" });
  });

  it("returns revoked for revoked invitation", () => {
    const inv = makeInvitation({ status: "revoked" });
    expect(validateInvitation(inv, NOW)).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns expired for past-due invitation", () => {
    const inv = makeInvitation({ expiresAt: "2026-08-18T00:00:00Z" }); // before NOW
    expect(validateInvitation(inv, NOW)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns expired for status=expired even with future expiresAt", () => {
    const inv = makeInvitation({ status: "expired", expiresAt: "2026-12-31T00:00:00Z" });
    expect(validateInvitation(inv, NOW)).toEqual({ valid: false, reason: "expired" });
  });

  it("returns expired for invalid expiresAt (NaN guard, fail-closed)", () => {
    const inv = makeInvitation({ expiresAt: "not-a-date" });
    expect(validateInvitation(inv, NOW)).toEqual({ valid: false, reason: "expired" });
  });
});

describe("validateAcceptParams()", () => {
  it("accepts valid params", () => {
    const result = validateAcceptParams({ token: "abc123", locale: "vi" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.token).toBe("abc123");
      expect(result.data.locale).toBe("vi");
    }
  });

  it("rejects null/non-object", () => {
    expect(validateAcceptParams(null).valid).toBe(false);
    expect(validateAcceptParams("string").valid).toBe(false);
  });

  it("rejects missing token", () => {
    const result = validateAcceptParams({ locale: "ja" });
    expect(result).toEqual({ valid: false, error: "missing_token" });
  });

  it("rejects unsupported locale", () => {
    const result = validateAcceptParams({ token: "abc", locale: "fr" });
    expect(result).toEqual({ valid: false, error: "invalid_locale" });
  });

  it("accepts all 6 supported locales", () => {
    for (const locale of ["ja", "en", "vi", "id", "fil", "hi"]) {
      const result = validateAcceptParams({ token: "abc", locale });
      expect(result.valid).toBe(true);
    }
  });
});

describe("isAssignableRole()", () => {
  it("accepts assignable roles", () => {
    expect(isAssignableRole("admin")).toBe(true);
    expect(isAssignableRole("staff")).toBe(true);
    expect(isAssignableRole("viewer")).toBe(true);
  });

  it("rejects non-assignable roles", () => {
    expect(isAssignableRole("super_admin")).toBe(false);
    expect(isAssignableRole("owner")).toBe(false);
    expect(isAssignableRole("unknown")).toBe(false);
  });
});

describe("inviteExpiresAt()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to 7 days", () => {
    expect(inviteExpiresAt()).toBe("2026-08-26T00:00:00.000Z");
  });

  it("accepts custom TTL", () => {
    expect(inviteExpiresAt(1)).toBe("2026-08-20T00:00:00.000Z");
  });
});
