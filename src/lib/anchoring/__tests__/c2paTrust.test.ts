import { X509Certificate } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { C2PA_TRUST_ANCHORS, C2PA_TRUST_SETTINGS } from "../c2paTrust";
import { C2PA_TRUST_LIST_PEM, C2PA_TSA_TRUST_LIST_PEM } from "../c2paTrustList.generated";

/**
 * 公式 Trust List（CA・TSA）が壊れずに入り、外部 C2PA の検証と署名時の原本 ingredient 検証の両方に渡っていることを見る。
 * リストを渡すと判定が変わること自体（Google Pixel の写真が expired/Invalid → Trusted）は、Program 素材での実測
 * （OPEN_QUESTIONS 2026-10-02）で確認した。素材はライセンス上リポジトリに入れていない。
 */
const certs = (pem: string) => pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
const fp = (pem: string) => new X509Certificate(pem).fingerprint256;

describe("C2PA trust list", () => {
  it.each([
    ["C2PA", C2PA_TRUST_LIST_PEM],
    ["TSA", C2PA_TSA_TRUST_LIST_PEM],
  ])("%s list holds parseable certificates", (_name, pem) => {
    const list = certs(pem);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) expect(() => new X509Certificate(c)).not.toThrow();
  });

  it("anchors are every certificate of both lists, each once", () => {
    const all = new Set([...certs(C2PA_TRUST_LIST_PEM), ...certs(C2PA_TSA_TRUST_LIST_PEM)].map(fp));
    const anchors = C2PA_TRUST_ANCHORS.map(fp);
    expect(new Set(anchors)).toEqual(all);
    expect(anchors).toHaveLength(all.size);
  });

  it("settings carry the anchors as c2pa-rs `trust.trust_anchors` (raw, no other keys)", () => {
    const parsed = JSON.parse(C2PA_TRUST_SETTINGS) as Record<string, Record<string, string>>;
    expect(Object.keys(parsed)).toEqual(["trust"]);
    expect(Object.keys(parsed.trust)).toEqual(["trust_anchors"]);
    expect(certs(parsed.trust.trust_anchors).map(fp)).toEqual(C2PA_TRUST_ANCHORS.map(fp));
  });
});

describe("the trust list reaches both validation paths", () => {
  const mode = process.env.C2PA_MODE;
  afterEach(() => {
    vi.doUnmock("@contentauth/c2pa-node");
    vi.doUnmock("../providers/c2paSigner");
    vi.resetModules();
    if (mode === undefined) delete process.env.C2PA_MODE;
    else process.env.C2PA_MODE = mode;
  });

  it("verifyExternalC2pa reads the upload with the trust settings", async () => {
    const fromAsset = vi.fn().mockResolvedValue(null);
    vi.doMock("@contentauth/c2pa-node", () => ({ Reader: { fromAsset } }));
    const { verifyExternalC2pa } = await import("../providers/c2paVerify");

    await verifyExternalC2pa(Buffer.from("x"), "image/jpeg");

    expect(fromAsset).toHaveBeenCalledWith({ buffer: expect.any(Buffer), mimeType: "image/jpeg" }, C2PA_TRUST_SETTINGS);
  });

  it("signC2pa builds the manifest (and its parentOf ingredient validation) with the trust settings", async () => {
    process.env.C2PA_MODE = "dev-signed";
    const builder = {
      addIngredient: vi.fn(),
      addRedaction: vi.fn(),
      sign: vi.fn((_s: unknown, _i: unknown, out: { buffer: Buffer | null }) => (out.buffer = Buffer.from("signed"))),
    };
    const withJson = vi.fn(() => builder);
    vi.doMock("@contentauth/c2pa-node", () => ({ Builder: { withJson }, Reader: { fromAsset: vi.fn() } }));
    vi.doMock("../providers/c2paSigner", () => ({ createC2paSigner: async () => ({}), signWithTimeStamp: vi.fn() }));
    const { signC2pa } = await import("../providers/c2pa");

    const res = await signC2pa(Buffer.from("x"), "image/jpeg");

    expect(res.signedBuffer).toEqual(Buffer.from("signed"));
    expect(withJson).toHaveBeenCalledWith(expect.any(Object), C2PA_TRUST_SETTINGS);
  });
});
