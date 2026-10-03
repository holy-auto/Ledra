import { X509Certificate } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { C2PA_TRUST_SETTINGS } from "../c2paTrust";
import { C2PA_TRUST_LIST_PEM, C2PA_TSA_TRUST_LIST_PEM } from "../c2paTrustList.generated";

/**
 * 公式 Trust List（CA・TSA）が壊れずに入っていて、外部 C2PA の検証に渡っていることを見る。
 * リストを渡すと判定が変わること自体（Google Pixel の写真が expired/Invalid → Trusted）は、Program 素材での実測
 * （OPEN_QUESTIONS 2026-10-02）で確認した。素材はライセンス上リポジトリに入れていない。
 */
const certs = (pem: string) => pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];

describe("C2PA trust list", () => {
  it.each([
    ["C2PA", C2PA_TRUST_LIST_PEM],
    ["TSA", C2PA_TSA_TRUST_LIST_PEM],
  ])("%s list holds parseable certificates", (_name, pem) => {
    const list = certs(pem);
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) expect(() => new X509Certificate(c)).not.toThrow();
  });

  it("trust anchors carry every certificate of both lists", () => {
    const anchors = certs(C2PA_TRUST_SETTINGS.trust.trustAnchors);
    expect(anchors).toEqual([...certs(C2PA_TRUST_LIST_PEM), ...certs(C2PA_TSA_TRUST_LIST_PEM)]);
  });
});

describe("verifyExternalC2pa uses the trust list", () => {
  afterEach(() => {
    vi.doUnmock("@contentauth/c2pa-node");
    vi.resetModules();
  });

  it("reads the asset with a Context built from C2PA_TRUST_SETTINGS", async () => {
    const fromAsset = vi.fn().mockResolvedValue(null);
    class Context {
      constructor(readonly settings: unknown) {}
    }
    vi.doMock("@contentauth/c2pa-node", () => ({ Reader: { fromAsset }, Context }));
    const { verifyExternalC2pa } = await import("../providers/c2paVerify");

    await verifyExternalC2pa(Buffer.from("x"), "image/jpeg");

    expect(fromAsset).toHaveBeenCalledTimes(1);
    const ctx = fromAsset.mock.calls[0][1] as Context;
    expect(ctx).toBeInstanceOf(Context);
    expect(ctx.settings).toBe(C2PA_TRUST_SETTINGS);
  });
});
