import { describe, it, expect } from "vitest";
import { deriveCaptureBindingReason, type CaptureBindingInput } from "../captureBindingReason";

const bound = (over: Partial<CaptureBindingInput> = {}): CaptureBindingInput => ({
  hasDeviceToken: true,
  hasNonce: true,
  deviceVerified: true,
  nonceResult: "ok",
  sealOk: true,
  ...over,
});

describe("deriveCaptureBindingReason", () => {
  it("returns null when the full capture-binding chain holds (guaranteed)", () => {
    expect(deriveCaptureBindingReason(bound())).toBeNull();
  });

  it("gallery_upload when neither device token nor nonce is present", () => {
    expect(
      deriveCaptureBindingReason(
        bound({ hasDeviceToken: false, hasNonce: false, deviceVerified: false, nonceResult: null }),
      ),
    ).toBe("gallery_upload");
  });

  it("attestation_failed when the device is not verified", () => {
    expect(deriveCaptureBindingReason(bound({ deviceVerified: false }))).toBe("attestation_failed");
  });

  it("maps each nonce failure to its reason", () => {
    expect(deriveCaptureBindingReason(bound({ nonceResult: "consumed" }))).toBe("nonce_replay");
    expect(deriveCaptureBindingReason(bound({ nonceResult: "expired" }))).toBe("nonce_expired");
    expect(deriveCaptureBindingReason(bound({ nonceResult: "mismatch" }))).toBe("nonce_cert_mismatch");
    expect(deriveCaptureBindingReason(bound({ nonceResult: "error" }))).toBe("nonce_error");
    expect(deriveCaptureBindingReason(bound({ nonceResult: "not_found" }))).toBe("offline_no_nonce");
    // device token present but no nonce sent → offline sync path
    expect(deriveCaptureBindingReason(bound({ hasNonce: false, nonceResult: null }))).toBe("offline_no_nonce");
  });

  it("no_capture_seal when device+nonce are OK but there is no C2PA/TSA seal", () => {
    expect(deriveCaptureBindingReason(bound({ sealOk: false }))).toBe("no_capture_seal");
  });

  it("reports the FIRST missing link (device before nonce before seal)", () => {
    // device fails AND nonce replayed AND no seal → device is reported first.
    expect(deriveCaptureBindingReason(bound({ deviceVerified: false, nonceResult: "consumed", sealOk: false }))).toBe(
      "attestation_failed",
    );
  });
});
