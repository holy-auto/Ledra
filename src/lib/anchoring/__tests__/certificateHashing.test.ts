import { describe, it, expect } from "vitest";
import {
  CERT_SCHEMA_VERSION,
  canonicalize,
  hashOptionalJson,
  hashContent,
  buildCanonicalCertificate,
  computeCertDigest,
  sha256Hex,
  type CertificateHashInput,
} from "../certificateHashing";

const HASH_NULL = "0".repeat(64);

const baseInput: CertificateHashInput = {
  publicId: "cert_abc123",
  tenantId: "11111111-1111-1111-1111-111111111111",
  issuedAt: "2026-04-27T09:00:00.000Z",
  versionAt: "2026-04-27T09:00:00.000Z",
  status: "active",
  vehicleInfo: { make: "Toyota", model: "Prius", year: 2024 },
  contentFreeText: "コーティング施工",
  contentPreset: { kind: "ceramic", layers: 2 },
  expiryType: "months",
  expiryValue: "12",
  imageSha256s: ["aaaa".repeat(16), "bbbb".repeat(16)],
};

describe("canonicalize", () => {
  it("produces sorted-key, no-whitespace JSON", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("handles nested objects with sorted keys at every level", () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: [{ d: 4, c: 3 }] })).toBe('{"a":[{"c":3,"d":4}],"z":{"x":2,"y":1}}');
  });

  it("handles primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hello")).toBe('"hello"');
  });

  it("normalizes strings to NFC", () => {
    // U+0041 U+0301 (decomposed Á) vs U+00C1 (precomposed Á)
    const decomposed = "Á";
    const precomposed = "Á";
    expect(canonicalize(decomposed)).toBe(canonicalize(precomposed));
  });

  it("normalizes object keys to NFC", () => {
    const decomposed = { ["Á"]: 1 };
    const precomposed = { ["Á"]: 1 };
    expect(canonicalize(decomposed)).toBe(canonicalize(precomposed));
  });

  it("omits keys whose value is undefined (treated as not-present)", () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it("rejects undefined as a top-level value", () => {
    expect(() => canonicalize(undefined)).toThrow(/undefined/);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalize(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it("rejects BigInt", () => {
    expect(() => canonicalize(BigInt(1))).toThrow(/unsupported type/);
  });

  it("rejects symbols and functions", () => {
    expect(() => canonicalize(Symbol("x"))).toThrow(/unsupported type/);
    expect(() => canonicalize(() => 1)).toThrow(/unsupported type/);
  });

  it("orders keys by UTF-16 code units (matches default Array.prototype.sort)", () => {
    expect(canonicalize({ z: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"z":1}');
  });
});

describe("hashOptionalJson", () => {
  it("returns zero hash for null and undefined", () => {
    expect(hashOptionalJson(null)).toBe(HASH_NULL);
    expect(hashOptionalJson(undefined)).toBe(HASH_NULL);
  });

  it("distinguishes null from empty object", () => {
    expect(hashOptionalJson({})).not.toBe(HASH_NULL);
    expect(hashOptionalJson({})).toBe(sha256Hex("{}"));
  });

  it("is order-independent for object keys", () => {
    expect(hashOptionalJson({ a: 1, b: 2 })).toBe(hashOptionalJson({ b: 2, a: 1 }));
  });
});

describe("hashContent", () => {
  it("returns zero hash when both fields are absent", () => {
    expect(hashContent(null, null)).toBe(HASH_NULL);
    expect(hashContent(undefined, undefined)).toBe(HASH_NULL);
    expect(hashContent("", null)).toBe(HASH_NULL);
  });

  it("hashes free text alone", () => {
    const h = hashContent("hello", null);
    expect(h).not.toBe(HASH_NULL);
    expect(h).toBe(sha256Hex('{"free":"hello","preset":null}'));
  });

  it("hashes preset alone", () => {
    const h = hashContent(null, { kind: "x" });
    expect(h).not.toBe(HASH_NULL);
    expect(h).toBe(sha256Hex('{"free":null,"preset":{"kind":"x"}}'));
  });

  it("treats undefined and null identically", () => {
    expect(hashContent(undefined, undefined)).toBe(hashContent(null, null));
  });
});

describe("buildCanonicalCertificate", () => {
  it("emits schema version constant", () => {
    const c = buildCanonicalCertificate(baseInput);
    expect(c.schema).toBe(CERT_SCHEMA_VERSION);
    expect(c.schema).toBe("ledra-cert-v1");
  });

  it("normalizes issued_at and version_at to ISO 8601 UTC ms", () => {
    const c = buildCanonicalCertificate({
      ...baseInput,
      issuedAt: new Date("2026-04-27T09:00:00Z"),
      versionAt: "2026-04-27T18:00:00+09:00",
    });
    expect(c.issued_at).toBe("2026-04-27T09:00:00.000Z");
    expect(c.version_at).toBe("2026-04-27T09:00:00.000Z");
  });

  it("rejects invalid date input", () => {
    expect(() => buildCanonicalCertificate({ ...baseInput, issuedAt: "not-a-date" })).toThrow(/invalid date/);
  });

  it("sorts image hashes ascending", () => {
    const c = buildCanonicalCertificate({
      ...baseInput,
      imageSha256s: ["cccc".repeat(16), "aaaa".repeat(16), "bbbb".repeat(16)],
    });
    expect(c.image_sha256_set).toEqual(["aaaa".repeat(16), "bbbb".repeat(16), "cccc".repeat(16)]);
  });

  it("lowercases image hashes", () => {
    const c = buildCanonicalCertificate({
      ...baseInput,
      imageSha256s: ["A".repeat(64)],
    });
    expect(c.image_sha256_set).toEqual(["a".repeat(64)]);
  });

  it("rejects malformed image hashes", () => {
    expect(() => buildCanonicalCertificate({ ...baseInput, imageSha256s: ["short"] })).toThrow(/malformed SHA-256/);
    expect(() =>
      buildCanonicalCertificate({
        ...baseInput,
        imageSha256s: ["g".repeat(64)],
      }),
    ).toThrow(/malformed SHA-256/);
  });

  it("omits expiry_type/expiry_value when null", () => {
    const c = buildCanonicalCertificate({
      ...baseInput,
      expiryType: null,
      expiryValue: null,
    });
    expect(c).not.toHaveProperty("expiry_type");
    expect(c).not.toHaveProperty("expiry_value");
  });

  it("includes expiry fields when set", () => {
    const c = buildCanonicalCertificate(baseInput);
    expect(c.expiry_type).toBe("months");
    expect(c.expiry_value).toBe("12");
  });

  it("uses zero hash for null vehicle info", () => {
    const c = buildCanonicalCertificate({ ...baseInput, vehicleInfo: null });
    expect(c.vehicle_info_hash).toBe(HASH_NULL);
  });

  it("does not contain any PII-shaped fields by type or runtime", () => {
    const c = buildCanonicalCertificate(baseInput) as unknown as Record<string, unknown>;
    expect(c).not.toHaveProperty("customer_name");
    expect(c).not.toHaveProperty("customer_phone_last4");
    expect(c).not.toHaveProperty("customer_id");
    expect(c).not.toHaveProperty("logo_asset_path");
    expect(c).not.toHaveProperty("footer_variant");
  });
});

describe("computeCertDigest", () => {
  it("is deterministic", () => {
    const a = computeCertDigest(baseInput);
    const b = computeCertDigest(baseInput);
    expect(a.digest).toBe(b.digest);
    expect(a.canonicalString).toBe(b.canonicalString);
  });

  it("produces a 64-char lowercase hex digest", () => {
    const { digest } = computeCertDigest(baseInput);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when status changes", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({ ...baseInput, status: "void" }).digest;
    expect(a).not.toBe(b);
  });

  it("changes when an image is added", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({
      ...baseInput,
      imageSha256s: [...baseInput.imageSha256s, "cccc".repeat(16)],
    }).digest;
    expect(a).not.toBe(b);
  });

  it("does not change when image input order changes", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({
      ...baseInput,
      imageSha256s: [...baseInput.imageSha256s].reverse(),
    }).digest;
    expect(a).toBe(b);
  });

  it("does not change when vehicle/preset object key order changes", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({
      ...baseInput,
      vehicleInfo: { year: 2024, model: "Prius", make: "Toyota" },
      contentPreset: { layers: 2, kind: "ceramic" },
    }).digest;
    expect(a).toBe(b);
  });

  it("changes when version_at changes (edits produce new digest)", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({
      ...baseInput,
      versionAt: "2026-04-27T10:00:00.000Z",
    }).digest;
    expect(a).not.toBe(b);
  });

  it("changes when content text changes", () => {
    const a = computeCertDigest(baseInput).digest;
    const b = computeCertDigest({
      ...baseInput,
      contentFreeText: "別の内容",
    }).digest;
    expect(a).not.toBe(b);
  });

  it("regression: locked digest for a fixed input (schema v1)", () => {
    // If this test fails, the canonical form has changed and ALL past
    // anchors will stop verifying. Bump CERT_SCHEMA_VERSION instead.
    const fixedInput: CertificateHashInput = {
      publicId: "cert_fixed",
      tenantId: "00000000-0000-0000-0000-000000000001",
      issuedAt: "2026-01-01T00:00:00.000Z",
      versionAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      vehicleInfo: null,
      contentFreeText: null,
      contentPreset: null,
      expiryType: null,
      expiryValue: null,
      imageSha256s: [],
    };
    const { canonicalString, digest } = computeCertDigest(fixedInput);
    expect(canonicalString).toBe(
      '{"content_hash":"' +
        HASH_NULL +
        '","image_sha256_set":[],"issued_at":"2026-01-01T00:00:00.000Z","public_id":"cert_fixed","schema":"ledra-cert-v1","status":"active","tenant_id":"00000000-0000-0000-0000-000000000001","vehicle_info_hash":"' +
        HASH_NULL +
        '","version_at":"2026-01-01T00:00:00.000Z"}',
    );
    expect(digest).toBe(sha256Hex(canonicalString));
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
