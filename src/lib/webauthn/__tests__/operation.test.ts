import { describe, it, expect } from "vitest";
import {
  buildOperationPayload,
  computeOperationPayloadHash,
  newChallengeNonce,
  payloadHashToChallengeBytes,
  OPERATION_PAYLOAD_VERSION,
} from "../operation";

const base = {
  operationType: "finalize" as const,
  tenantId: "t-1",
  certificateId: "c-1",
  actorId: "u-1",
  challengeNonce: "nonce-1",
};

describe("buildOperationPayload", () => {
  it("includes version, op, tenant, cert, actor, nonce", () => {
    expect(buildOperationPayload(base)).toEqual({
      version: OPERATION_PAYLOAD_VERSION,
      operation_type: "finalize",
      tenant_id: "t-1",
      certificate_id: "c-1",
      actor_id: "u-1",
      challenge_nonce: "nonce-1",
    });
  });
});

describe("computeOperationPayloadHash", () => {
  it("is a deterministic 64-hex", () => {
    const h = computeOperationPayloadHash(buildOperationPayload(base));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeOperationPayloadHash(buildOperationPayload(base))).toBe(h);
  });

  it("changes when op / cert / nonce change (署名が別イベントに使い回せない)", () => {
    const h = computeOperationPayloadHash(buildOperationPayload(base));
    expect(computeOperationPayloadHash(buildOperationPayload({ ...base, operationType: "void" }))).not.toBe(h);
    expect(computeOperationPayloadHash(buildOperationPayload({ ...base, certificateId: "c-2" }))).not.toBe(h);
    expect(computeOperationPayloadHash(buildOperationPayload({ ...base, challengeNonce: "nonce-2" }))).not.toBe(h);
  });
});

describe("newChallengeNonce", () => {
  it("is url-safe and unique per call", () => {
    const a = newChallengeNonce();
    const b = newChallengeNonce();
    expect(a).not.toMatch(/[+/=]/);
    expect(a).not.toBe(b);
  });
});

describe("payloadHashToChallengeBytes", () => {
  it("decodes 64-hex into 32 bytes", () => {
    const hash = "a".repeat(64);
    const bytes = payloadHashToChallengeBytes(hash);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0xaa);
  });
});
