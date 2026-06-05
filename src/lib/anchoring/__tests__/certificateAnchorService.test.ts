/**
 * 証明書レコードアンカリングの write-path (enqueue) テスト。
 *
 * - buildCertificateHashInput: 行 → CertificateHashInput の純関数マッピング
 * - isCertRecordAnchorEnabled: env オプトイン
 * - enqueueCertificateAnchor: 既定 no-op / queued 行の積み込み / dedup / 異常系で投げない
 *
 * createTenantScopedAdmin は supply-partners テスト同様に in-memory store へ差し替える。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeCertDigest } from "../certificateHashing";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CERT_ID = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => {
  const h: { store: Record<string, Record<string, unknown>[]>; makeAdmin: () => { from: (t: string) => unknown } } = {
    store: {},
    makeAdmin: () => ({ from: () => ({}) }),
  };
  function makeAdmin() {
    const store = h.store;
    function from(table: string) {
      if (!store[table]) store[table] = [];
      const rows = store[table];
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let op: "select" | "insert" = "select";
      let inserted: Record<string, unknown>[] = [];
      function run(single: boolean) {
        if (op === "insert") return { data: single ? (inserted[0] ?? null) : inserted, error: null };
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return { data: single ? (out[0] ?? null) : out, error: null };
      }
      const b: Record<string, unknown> = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        insert: (p: Record<string, unknown> | Record<string, unknown>[]) => {
          op = "insert";
          inserted = (Array.isArray(p) ? p : [p]).map((x) => ({ ...x }));
          rows.push(...inserted);
          return b;
        },
        single: () => Promise.resolve(run(true)),
        maybeSingle: () => Promise.resolve(run(true)),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(run(false)).then(res, rej),
      };
      return b;
    }
    return { from };
  }
  h.makeAdmin = makeAdmin;
  return h;
});

vi.mock("@/lib/supabase/admin", () => ({ createTenantScopedAdmin: () => ({ admin: h.makeAdmin() }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, info: () => {}, error: () => {}, child: () => ({}) } }));

import {
  buildCertificateHashInput,
  isCertRecordAnchorEnabled,
  enqueueCertificateAnchor,
  type CertificateAnchorRow,
} from "../certificateAnchorService";

const certRow = (over: Partial<CertificateAnchorRow & { id: string }> = {}) => ({
  id: CERT_ID,
  public_id: "cert_abc123",
  tenant_id: TENANT,
  created_at: "2026-04-27T09:00:00.000Z",
  updated_at: "2026-04-27T10:30:00.000Z",
  status: "active",
  vehicle_info_json: { make: "Toyota", model: "Prius" },
  content_free_text: "コーティング施工",
  content_preset_json: { kind: "ceramic", layers: 2 },
  expiry_type: "months",
  expiry_value: "12",
  ...over,
});

beforeEach(() => {
  h.store = { certificates: [], certificate_images: [], certificate_anchors: [] };
  vi.stubEnv("CERT_RECORD_ANCHOR_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("buildCertificateHashInput", () => {
  it("maps a row + image hashes into a CertificateHashInput", () => {
    const input = buildCertificateHashInput(certRow(), ["a".repeat(64)]);
    expect(input).toMatchObject({
      publicId: "cert_abc123",
      tenantId: TENANT,
      issuedAt: "2026-04-27T09:00:00.000Z",
      versionAt: "2026-04-27T10:30:00.000Z",
      status: "active",
      contentFreeText: "コーティング施工",
      expiryType: "months",
      expiryValue: "12",
      imageSha256s: ["a".repeat(64)],
    });
  });

  it("falls back to created_at when updated_at is null", () => {
    const input = buildCertificateHashInput(certRow({ updated_at: null }), []);
    expect(input.versionAt).toBe("2026-04-27T09:00:00.000Z");
  });

  it("clamps unknown status to draft (canonical-safe)", () => {
    expect(buildCertificateHashInput(certRow({ status: "weird" }), []).status).toBe("draft");
    expect(buildCertificateHashInput(certRow({ status: "void" }), []).status).toBe("void");
  });

  it("coerces null jsonb fields to null (not undefined)", () => {
    const input = buildCertificateHashInput(certRow({ vehicle_info_json: null, content_preset_json: null }), []);
    expect(input.vehicleInfo).toBeNull();
    expect(input.contentPreset).toBeNull();
  });
});

describe("isCertRecordAnchorEnabled", () => {
  it("is true only when env is exactly 'true'", () => {
    vi.stubEnv("CERT_RECORD_ANCHOR_ENABLED", "true");
    expect(isCertRecordAnchorEnabled()).toBe(true);
    vi.stubEnv("CERT_RECORD_ANCHOR_ENABLED", "1");
    expect(isCertRecordAnchorEnabled()).toBe(false);
    vi.stubEnv("CERT_RECORD_ANCHOR_ENABLED", "");
    expect(isCertRecordAnchorEnabled()).toBe(false);
  });
});

describe("enqueueCertificateAnchor", () => {
  it("is a no-op when disabled (env not 'true')", async () => {
    vi.stubEnv("CERT_RECORD_ANCHOR_ENABLED", "false");
    h.store.certificates.push(certRow());
    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });
    expect(res).toEqual({ queued: false, reason: "disabled" });
    expect(h.store.certificate_anchors).toHaveLength(0);
  });

  it("returns not_found when the certificate is absent", async () => {
    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });
    expect(res).toEqual({ queued: false, reason: "not_found" });
    expect(h.store.certificate_anchors).toHaveLength(0);
  });

  it("inserts a queued anchor row with the canonical digest + json", async () => {
    h.store.certificates.push(certRow());
    h.store.certificate_images.push(
      { certificate_id: CERT_ID, tenant_id: TENANT, sha256: "b".repeat(64) },
      { certificate_id: CERT_ID, tenant_id: TENANT, sha256: "a".repeat(64) },
      // malformed sha256 is filtered out (must not throw the canonical builder)
      { certificate_id: CERT_ID, tenant_id: TENANT, sha256: "short" },
      { certificate_id: CERT_ID, tenant_id: TENANT, sha256: null },
    );

    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });

    const expected = computeCertDigest(buildCertificateHashInput(certRow(), ["b".repeat(64), "a".repeat(64)]));
    expect(res).toEqual({ queued: true, digest: expected.digest });
    expect(h.store.certificate_anchors).toHaveLength(1);
    const row = h.store.certificate_anchors[0];
    expect(row).toMatchObject({
      tenant_id: TENANT,
      certificate_id: CERT_ID,
      cert_digest: expected.digest,
      schema_version: "ledra-cert-v1",
      status: "queued",
      anchor_route: "batch",
    });
    expect(row.canonical_json).toEqual(expected.canonical);
  });

  it("dedups: skips when the latest anchor has the same digest", async () => {
    h.store.certificates.push(certRow());
    const { digest } = computeCertDigest(buildCertificateHashInput(certRow(), []));
    h.store.certificate_anchors.push({
      certificate_id: CERT_ID,
      tenant_id: TENANT,
      cert_digest: digest,
      created_at: "2026-04-27T10:30:00.000Z",
    });

    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });
    expect(res).toEqual({ queued: false, reason: "unchanged" });
    expect(h.store.certificate_anchors).toHaveLength(1);
  });

  it("queues a new row when content changed (digest differs from latest)", async () => {
    h.store.certificates.push(certRow());
    h.store.certificate_anchors.push({
      certificate_id: CERT_ID,
      tenant_id: TENANT,
      cert_digest: "f".repeat(64), // stale digest
      created_at: "2026-04-27T09:00:00.000Z",
    });

    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });
    expect(res.queued).toBe(true);
    expect(h.store.certificate_anchors).toHaveLength(2);
  });

  it("does not enqueue across tenants (tenant filter)", async () => {
    h.store.certificates.push(certRow({ tenant_id: "other-tenant" }));
    const res = await enqueueCertificateAnchor({ tenantId: TENANT, certificateId: CERT_ID });
    expect(res).toEqual({ queued: false, reason: "not_found" });
  });
});
