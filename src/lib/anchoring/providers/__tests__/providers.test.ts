import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { requireNative } from "../../__tests__/nativeImaging";
import { dirname, join } from "node:path";

// Dynamically import so env vars take effect per-test
async function loadProviders() {
  // Clear module cache to pick up env changes
  vi.resetModules();
  return import("../index");
}

async function loadGrade() {
  vi.resetModules();
  return import("../../authenticityGrade");
}

describe("invokeAllUploadProviders", () => {
  const dummyBuffer = Buffer.from("test-image-data");

  beforeEach(() => {
    // Reset all provider env vars to disabled
    delete process.env.C2PA_MODE;
    delete process.env.DEEPFAKE_PROVIDER;
    delete process.env.DEVICE_ATTESTATION_ENABLED;
    delete process.env.POLYGON_ANCHOR_ENABLED;
  });

  // **このファイルで最初に `loadProviders()` を呼ぶテストが、provider グラフ全体の
  // モジュール評価を1人で払う。** 単体では 241ms だが、`ci-parallel-checks.sh` が10本を
  // 同時に走らせた回に **default 5s を超えて落ちた**（2026-10-09 実測）。
  // 同じ形は `M-20260913-ci-test-timeout` にある。下の3テストは同じ理由で既に 30s に
  // 延ばしてあり、**ここに適用し忘れていた**。
  // 注意: 延長が要るのは「最初に `loadProviders()` を呼ぶテスト」なので、
  // 並び替えでこれより前に `loadProviders()` を呼ぶテストを足すなら、そちらにも付ける。
  it("returns safe defaults when all providers are disabled", async () => {
    const { invokeAllUploadProviders } = await loadProviders();
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    expect(result.c2pa).toEqual({
      manifestCid: null,
      verified: false,
      signedBuffer: null,
      manifestSummary: null,
      failure: null,
    });
    expect(result.deepfake).toEqual({ score: null, verdict: null });
    expect(result.polygon).toEqual({ txHash: null, anchored: false, network: null });
  }, 30_000);

  // c2pa-node の native binding 初期化 + 失敗ハンドリングが含まれるため、
  // 高負荷の CI ランナー上では default 5s timeout を超えうる。30s に拡張。
  it("falls back gracefully when c2pa signing fails on non-JPEG buffer", async () => {
    process.env.C2PA_MODE = "dev-signed";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { invokeAllUploadProviders } = await loadProviders();
    // dummyBuffer is not a valid JPEG, so c2pa-node will fail
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    // Should fall back without throwing...
    expect(result.c2pa.verified).toBe(false);
    expect(result.c2pa.signedBuffer).toBeNull();
    // ...but **must not look like `C2PA_MODE=disabled`**。ここが null に戻ると、
    // 呼び出し側が「意図的にオフ」と「試して失敗」を区別できず、本番で黙って未署名の写真が
    // 保存される（代表判断 2026-10-02: 本番では止める）。この1行がその退行を止める。
    expect(result.c2pa.failure, "署名失敗は disabled と区別できる値で返る").not.toBeNull();

    errorSpy.mockRestore();
    infoSpy.mockRestore();
  }, 30_000);

  it("returns disabled deepfake result when HIVE_API_KEY is missing", async () => {
    process.env.DEEPFAKE_PROVIDER = "hive";
    delete process.env.HIVE_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { invokeAllUploadProviders } = await loadProviders();
    const result = await invokeAllUploadProviders(dummyBuffer, "image/jpeg", "abc123");

    expect(result.deepfake).toEqual({ score: null, verdict: null });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[deepfake] HIVE_API_KEY not set"));

    warnSpy.mockRestore();
  });
});

describe("signC2pa directly", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.C2PA_MODE;
  });

  // `C2PA_MODE` の正規化は**本番ゲートの前提**。綴り違いを "production" として通すと
  // ゲートだけが発火して全アップロードが落ち、"disabled" に落ちると署名もゲートも止まって
  // 黙って未署名に戻る（/code-review 指摘 #5）。両方向を固定する。
  it.each([
    ["production", "production"],
    ["dev-signed", "dev-signed"],
    ["disabled", "disabled"],
    ["Production", "disabled"],
    ["prod", "disabled"],
    ["", "disabled"],
  ])("getMode(%j) === %j", async (raw, expected) => {
    process.env.C2PA_MODE = raw;
    vi.resetModules();
    const { getMode } = await import("../c2pa");
    expect(getMode()).toBe(expected);
  });

  it("returns disabled result when C2PA_MODE is unset", async () => {
    const { signC2pa } = await (async () => {
      vi.resetModules();
      return import("../c2pa");
    })();

    const result = await signC2pa(Buffer.from("test"), "image/jpeg");
    expect(result).toEqual({
      manifestCid: null,
      verified: false,
      signedBuffer: null,
      manifestSummary: null,
      failure: null,
    });
  });

  it("returns disabled result when C2PA_MODE is disabled", async () => {
    process.env.C2PA_MODE = "disabled";
    const { signC2pa } = await (async () => {
      vi.resetModules();
      return import("../c2pa");
    })();

    const result = await signC2pa(Buffer.from("test"), "image/jpeg");
    expect(result).toEqual({
      manifestCid: null,
      verified: false,
      signedBuffer: null,
      manifestSummary: null,
      failure: null,
    });
  });
});

// Happy-path signing: the existing tests only cover the disabled path and the
// bad-buffer fallback, so a broken sign() (e.g. wrong Builder construction, or a
// cert that fails the C2PA profile) silently fell back to unsigned and no test
// caught it. This test signs a real JPEG and reads the manifest back.
describe("signC2pa happy path (dev-signed)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.C2PA_MODE;
    delete process.env.PINATA_JWT;
  });

  it("signs a real JPEG and embeds a readable capture-bound manifest", async () => {
    process.env.C2PA_MODE = "dev-signed";

    // **fail-closed**（DECISION_LOG 2026-09-21）。以前はここで native binding の有無を
    // 調べ、無ければ強い検証を飛ばして degradation の契約だけを見ていた。skip ではないが、
    // **CI から見える結果は skip と同じ（緑のまま C2PA の中身が検査されない）**だった
    // （PR #1115 の `/code-review` で陰性対照つきで指摘: モジュールを退避しても 24 passed）。
    // degradation の契約自体は、このファイルの上の方で不正な JPEG を渡す形で
    // 決定的に検査しているので、ここで環境依存の分岐を持つ必要は無い。
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@contentauth/c2pa-node");
    // パッケージが在っても、別OS向けの native binding だとロード時に落ちる。
    // ここで読み込んでおくことで、その場合も「署名できなかった」ではなく
    // 「ネイティブ依存が壊れている」として落ちる。
    require(join(dirname(entry), "index.node"));

    const sharp = (await requireNative(() => import("sharp"), "sharp")).default;
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer();

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { signC2pa } = await import("../c2pa");
    const result = await signC2pa(jpeg, "image/jpeg", { publicId: "cert_test123", vin: "TESTVIN0000000001" });
    infoSpy.mockRestore();

    expect(result.verified).toBe(true);
    expect(result.signedBuffer).not.toBeNull();
    expect(result.signedBuffer!.length).toBeGreaterThan(jpeg.length);

    const { Reader } = await import("@contentauth/c2pa-node");
    const reader = await Reader.fromAsset({ buffer: result.signedBuffer, mimeType: "image/jpeg" });
    const json = reader.json();
    const jstr = typeof json === "string" ? json : JSON.stringify(json);
    expect(jstr).toContain("com.ledra.capture");
    expect(jstr).toContain("cert_test123");
  }, 30_000);
});

describe("anchorToPolygon", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_ANCHOR_ENABLED;
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_PRIVATE_KEY;
    delete process.env.POLYGON_CONTRACT_ADDRESS;
  });

  it("returns disabled result when POLYGON_ANCHOR_ENABLED is not set", async () => {
    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(result).toEqual({ txHash: null, anchored: false, network: null });
  });

  it("returns disabled result when enabled but missing config", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    // Missing RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    expect(result).toEqual({ txHash: null, anchored: false, network: null });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[polygon] enabled but missing config"));

    warnSpy.mockRestore();
  });

  // このテストは実際に RPC への DNS / TCP 解決を行うため、ネットワーク状況
  // により 5s default を超えて flaky になる。30s まで許容する。
  it("returns disabled result when transaction fails", async () => {
    process.env.POLYGON_ANCHOR_ENABLED = "true";
    process.env.POLYGON_RPC_URL = "https://polygon-rpc.com";
    process.env.POLYGON_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
    process.env.POLYGON_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.resetModules();
    const { anchorToPolygon } = await import("../polygon");
    // Will fail because we can't actually connect to RPC in tests
    const result = await anchorToPolygon("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");

    expect(result).toEqual({ txHash: null, anchored: false, network: null });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[polygon] anchoring failed:"), expect.anything());

    errorSpy.mockRestore();
  }, 30_000);
});

describe("verifyAnchor", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.POLYGON_NETWORK;
    delete process.env.POLYGON_RPC_URL;
    delete process.env.POLYGON_PRIVATE_KEY;
    delete process.env.POLYGON_CONTRACT_ADDRESS;
  });

  it("returns false when config is missing", async () => {
    vi.resetModules();
    const { verifyAnchor } = await import("../polygon");
    const result = await verifyAnchor("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    expect(result).toBe(false);
  });
});

describe("buildExplorerUrl", () => {
  it("returns mainnet Polygonscan URL", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", "polygon")).toBe("https://polygonscan.com/tx/0xabc");
  });

  it("returns Amoy testnet Polygonscan URL", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", "amoy")).toBe("https://amoy.polygonscan.com/tx/0xabc");
  });

  it("returns null when tx hash missing", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl(null, "polygon")).toBeNull();
  });

  it("returns null when network missing", async () => {
    const { buildExplorerUrl } = await import("../polygon");
    expect(buildExplorerUrl("0xabc", null)).toBeNull();
  });
});

describe("computeAuthenticityGrade with c2paKind", () => {
  it("returns basic when c2paKind is dev-signed even if hasC2pa is true", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasC2pa: true,
      c2paKind: "dev-signed",
      hasTsa: false,
      deviceOk: true,
      nonceOk: true,
      deepfakeOk: true,
    });

    expect(grade).toBe("basic");
  });

  it("returns verified when c2paKind is production with C2PA + device OK", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasC2pa: true,
      c2paKind: "production",
      hasTsa: false,
      deviceOk: true,
      nonceOk: true,
      deepfakeOk: null,
    });

    expect(grade).toBe("verified");
  });

  it("returns premium with production C2PA + device OK + deepfake OK", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasC2pa: true,
      c2paKind: "production",
      hasTsa: false,
      deviceOk: true,
      nonceOk: true,
      deepfakeOk: true,
    });

    expect(grade).toBe("premium");
  });

  it("returns basic when c2paKind is omitted (backward compat)", async () => {
    const { computeAuthenticityGrade } = await loadGrade();

    const grade = computeAuthenticityGrade({
      hasSha256: true,
      hasC2pa: false,
      hasTsa: false,
      deviceOk: false,
      nonceOk: false,
      deepfakeOk: null,
    });

    expect(grade).toBe("basic");
  });
});

describe("checkDeepfake", () => {
  const dummyBuffer = Buffer.from("test-image-data");

  beforeEach(() => {
    vi.resetModules();
    delete process.env.DEEPFAKE_PROVIDER;
    delete process.env.HIVE_API_KEY;
  });

  it("returns disabled result when DEEPFAKE_PROVIDER is unset", async () => {
    const { checkDeepfake } = await (async () => {
      vi.resetModules();
      return import("../deepfake");
    })();

    const result = await checkDeepfake(dummyBuffer);
    expect(result).toEqual({ score: null, verdict: null });
  });

  it("returns disabled result when DEEPFAKE_PROVIDER is disabled", async () => {
    process.env.DEEPFAKE_PROVIDER = "disabled";
    const { checkDeepfake } = await (async () => {
      vi.resetModules();
      return import("../deepfake");
    })();

    const result = await checkDeepfake(dummyBuffer);
    expect(result).toEqual({ score: null, verdict: null });
  });

  it("returns disabled result when provider=hive but HIVE_API_KEY missing", async () => {
    process.env.DEEPFAKE_PROVIDER = "hive";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { checkDeepfake } = await (async () => {
      vi.resetModules();
      return import("../deepfake");
    })();

    const result = await checkDeepfake(dummyBuffer);
    expect(result).toEqual({ score: null, verdict: null });
    expect(warnSpy).toHaveBeenCalledWith("[deepfake] HIVE_API_KEY not set, skipping");

    warnSpy.mockRestore();
  });

  it("warns for unimplemented sensity provider", async () => {
    process.env.DEEPFAKE_PROVIDER = "sensity";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { checkDeepfake } = await (async () => {
      vi.resetModules();
      return import("../deepfake");
    })();

    const result = await checkDeepfake(dummyBuffer);
    expect(result).toEqual({ score: null, verdict: null });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("sensity"));

    warnSpy.mockRestore();
  });
});

describe("signC2pa IPFS pinning", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.C2PA_MODE;
    delete process.env.PINATA_JWT;
  });

  it("returns null manifestCid when PINATA_JWT is unset", async () => {
    process.env.C2PA_MODE = "disabled";
    const { signC2pa } = await (async () => {
      vi.resetModules();
      return import("../c2pa");
    })();

    const result = await signC2pa(Buffer.from("test"), "image/jpeg");
    expect(result.manifestCid).toBeNull();
  });
});
