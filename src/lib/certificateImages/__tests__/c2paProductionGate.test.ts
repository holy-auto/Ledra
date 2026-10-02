import { describe, it, expect, beforeAll, afterEach } from "vitest";
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

  afterEach(() => {
    delete process.env.C2PA_MODE;
    delete process.env.C2PA_SIGNER_CERT;
    delete process.env.C2PA_SIGNER_KEY;
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
  }, 30_000);
});
