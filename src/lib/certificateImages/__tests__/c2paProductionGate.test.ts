import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { requireNative } from "@/lib/anchoring/__tests__/nativeImaging";
import type { ProcessPhotoParams } from "../processUploadedPhoto";

/**
 * `C2PA_MODE=production` で署名に失敗したら、写真を**保存せずに断る**こと。
 *
 * 代表判断 2026-10-02「黙って未署名はダメだ」。これが無かった頃は、署名の失敗経路が
 * すべて `C2PA_MODE=disabled` と同じ「未署名」の結果を返していたため、本番でも等級だけ
 * 下がって写真が保存され、誰にも知らされなかった。
 *
 * `admin` を**触ったら落ちるスタブ**にしてあるのが要点。これで「断る」だけでなく
 * **ストレージ/DB に1バイトも書く前に断っている**ことまで検査できる（孤児ファイルを残さない）。
 * ゲートを upload より後ろに動かすと、このテストが落ちる。
 */
describe("processUploadedPhoto: 本番モードの C2PA 署名失敗ゲート", () => {
  let sharp: typeof import("sharp").default;

  beforeAll(async () => {
    // fail-closed（DECISION_LOG 2026-09-21）: 読み込めないことは skip ではなく失敗にする。
    sharp = (await requireNative(() => import("sharp"), "sharp")).default;
  });

  // **env は保存して復元する。** `c2paSignValidateProduction.test.ts` は本番の cert/key を
  // export して走らせる手順になっており（同ファイル冒頭）、その環境でこのテストを回すと
  // 署名器が実際に作れてしまい、ゲートが発火せず「ゲートより前に admin を触った」という
  // **存在しない退行**を指して落ちる。前提（cert/key 不在）はテスト自身が作る（/code-review 指摘 #8）。
  const saved: Record<string, string | undefined> = {};
  const KEYS = ["C2PA_MODE", "C2PA_SIGNER_CERT", "C2PA_SIGNER_KEY", "PINATA_JWT"] as const;

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  /** 触れたら即失敗する admin。ゲートより前に DB/ストレージへ行っていないことの証拠になる。 */
  function explodingAdmin(): ProcessPhotoParams["admin"] {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          throw new Error(
            `ゲートより前に admin.${String(prop)} を触った。C2PA 署名の判定はストレージ書き込みの前で行うこと。`,
          );
        },
      },
    ) as unknown as ProcessPhotoParams["admin"];
  }

  async function params(buffer: Buffer): Promise<ProcessPhotoParams> {
    return {
      admin: explodingAdmin(),
      tenantId: "11111111-1111-1111-1111-111111111111",
      certId: "22222222-2222-2222-2222-222222222222",
      publicId: "TEST-0001",
      stage: "before",
      buffer,
      mime: "image/jpeg",
      fileName: "test.jpg",
      index: 0,
      sortOrder: 0,
      capture: { attestation: { provider: "none", verified: false }, nonceOk: false, nonceResult: null },
      tsaBudget: { enabled: false, limitMs: 0, spentMs: 0, gaveUp: false },
    } satisfies ProcessPhotoParams;
  }

  it("production で署名器が作れないとき、保存せず internal_error を返す", async () => {
    // cert/key を入れずに production にすると createC2paSigner が null を返す
    // → signC2pa が failure="signer_unavailable" を返す（disabled と区別できる）。
    process.env.C2PA_MODE = "production";

    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .toBuffer();

    const { processUploadedPhoto } = await import("../processUploadedPhoto");
    const result = await processUploadedPhoto(await params(jpeg));

    expect(result.ok, "未署名の写真は保存しない").toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("internal_error");
    expect(result.message, "なぜ止まったか人が読める").toContain("C2PA");
    expect(result.c2paRefused, "呼び出し側が他の失敗と区別できる").toBe(true);
  }, 30_000);

  it("dev-signed では署名に失敗しても弾かず、保存の段に進む", async () => {
    // ゲートの条件は `mode === "production" && failure` の2つ。production 側のテストは failure しか
    // 固定していないので、`mode ===` を外す変異（＝開発/検証のアップロードまで弾き始める）を
    // 誰も捕まえられない（/code-review 指摘 #9）。ここで mode 側を固定する。
    //
    // **署名器を壊して失敗を作ることはできない**: dev-signed はその場で自己署名の鍵を作るので、
    // 有効な JPEG を渡すと署名は成功する（実測: verified=true / failure=null）。
    // 最初はこれに気づかずテストを書き、ゲートを広げる変異が**捕まらなかった**。
    // なので provider を差し替えて failure を確実に立てる。
    process.env.C2PA_MODE = "dev-signed";

    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .jpeg()
      .toBuffer();

    vi.resetModules();
    vi.doMock("@/lib/anchoring/providers", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/anchoring/providers")>()),
      invokeAllUploadProviders: async () => ({
        c2pa: {
          manifestCid: null,
          verified: false,
          signedBuffer: null,
          manifestSummary: null,
          failure: "sign_threw" as const,
        },
        deepfake: { score: null, verdict: null },
        polygon: { txHash: null, anchored: false, network: null },
      }),
    }));

    try {
      const { processUploadedPhoto } = await import("../processUploadedPhoto");
      // 弾かれない＝ゲートを通り抜けて保存の段へ進む。admin は触ったら落ちるスタブなので、
      // **その爆発が「弾かなかった」ことの証拠になる**（ok:false で静かに返ってきたら退行）。
      await expect(processUploadedPhoto(await params(jpeg)), "dev-signed は弾かない").rejects.toThrow(
        /ゲートより前に admin\./,
      );
    } finally {
      vi.doUnmock("@/lib/anchoring/providers");
      vi.resetModules();
    }
  }, 30_000);
});
