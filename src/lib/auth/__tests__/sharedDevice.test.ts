import { describe, it, expect } from "vitest";
import { SESSION_MODES, canSwitchUser, switchAuthRequirement, DEFAULT_AUTO_LOCK_SECONDS } from "../sharedDevice";

describe("SESSION_MODES", () => {
  it("2 モード: personal / shared", () => {
    expect(SESSION_MODES).toEqual(["personal", "shared"]);
  });
});

describe("canSwitchUser()", () => {
  it("shared → true", () => {
    expect(canSwitchUser("shared")).toBe(true);
  });

  it("personal → false", () => {
    expect(canSwitchUser("personal")).toBe(false);
  });
});

describe("switchAuthRequirement()", () => {
  it("trusted → biometric", () => {
    expect(switchAuthRequirement("trusted")).toBe("biometric");
  });

  it("recognized → pin", () => {
    expect(switchAuthRequirement("recognized")).toBe("pin");
  });

  it("unknown → full_auth", () => {
    expect(switchAuthRequirement("unknown")).toBe("full_auth");
  });
});

describe("DEFAULT_AUTO_LOCK_SECONDS", () => {
  it("5 分（300 秒）", () => {
    expect(DEFAULT_AUTO_LOCK_SECONDS).toBe(300);
  });
});
