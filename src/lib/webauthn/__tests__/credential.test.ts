import { describe, it, expect } from "vitest";
import { bytesToBase64Url, base64UrlToBytes, buildOperatorCredentialInsert, toWebAuthnCredential } from "../credential";

describe("base64url roundtrip", () => {
  it("encodes and decodes bytes losslessly", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63]); // includes +/ 相当のバイト
    const s = bytesToBase64Url(bytes);
    expect(s).not.toMatch(/[+/=]/); // url-safe・パディングなし
    expect(Array.from(base64UrlToBytes(s))).toEqual(Array.from(bytes));
  });
});

describe("buildOperatorCredentialInsert", () => {
  const baseInfo = {
    credential: {
      id: "cred-abc",
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 5,
      transports: ["internal", "hybrid"],
    },
    aaguid: "6028b017-b1d4-4c02-b4b3-afcdafc96bb2",
    credentialDeviceType: "multiDevice" as const,
    credentialBackedUp: true,
  };

  it("maps the verified registration into a DB row", () => {
    const row = buildOperatorCredentialInsert(baseInfo, { tenantId: "t1", userId: "u1", deviceLabel: "  iPhone  " });
    expect(row).toMatchObject({
      tenant_id: "t1",
      user_id: "u1",
      credential_id: "cred-abc",
      counter: 5,
      transports: ["internal", "hybrid"],
      aaguid: "6028b017-b1d4-4c02-b4b3-afcdafc96bb2",
      device_type: "multiDevice",
      backed_up: true,
      device_label: "iPhone", // trimmed
    });
    expect(row.public_key).toBe(bytesToBase64Url(baseInfo.credential.publicKey));
  });

  it("nulls the all-zero aaguid, empty transports, and blank label", () => {
    const row = buildOperatorCredentialInsert(
      {
        credential: { id: "c2", publicKey: new Uint8Array([9]), counter: 0, transports: [] },
        aaguid: "00000000-0000-0000-0000-000000000000",
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
      { tenantId: "t", userId: "u", deviceLabel: "   " },
    );
    expect(row.aaguid).toBeNull();
    expect(row.transports).toBeNull();
    expect(row.device_label).toBeNull();
    expect(row.backed_up).toBe(false);
  });
});

describe("toWebAuthnCredential", () => {
  it("reconstructs the verifier credential (publicKey back to bytes)", () => {
    const pk = new Uint8Array([10, 20, 30]);
    const cred = toWebAuthnCredential({
      credential_id: "cred-x",
      public_key: bytesToBase64Url(pk),
      counter: 7,
      transports: ["usb"],
    });
    expect(cred.id).toBe("cred-x");
    expect(cred.counter).toBe(7);
    expect(cred.transports).toEqual(["usb"]);
    expect(Array.from(cred.publicKey)).toEqual(Array.from(pk));
  });

  it("omits transports when none stored", () => {
    const cred = toWebAuthnCredential({
      credential_id: "c",
      public_key: bytesToBase64Url(new Uint8Array([1])),
      counter: 0,
      transports: null,
    });
    expect(cred).not.toHaveProperty("transports");
  });
});
