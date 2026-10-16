/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";

import { inspectStoredVideo } from "../inspectStoredVideo";

// MP4: 先頭 4 バイトの box サイズ + "ftyp" + ブランド "isom"
const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(52)]);
const admin = {
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://s/v?token=x" } }) }) },
} as any;

function stubFetch(head: Buffer, total: number, status = 206, contentType?: string) {
  const fetchMock = vi.fn(
    async () =>
      new Response(new Uint8Array(head), {
        status,
        headers: {
          ...(status === 206 ? { "content-range": `bytes 0-${head.length - 1}/${total}` } : {}),
          ...(contentType ? { "content-type": contentType } : {}),
        },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("inspectStoredVideo [直接アップロードされた動画の実物の検査]", () => {
  it("先頭だけを読み（Range）、形式と大きさを Storage の実物から返す", async () => {
    const fetchMock = stubFetch(MP4_HEAD, 30 * 1024 * 1024);
    const r = await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4");
    expect(r).toEqual({ ok: true, data: { mime: "video/mp4", ext: "mp4", size: 30 * 1024 * 1024 } });
    expect((fetchMock.mock.calls[0] as any[])[1]).toEqual({ headers: { Range: "bytes=0-63" } });
  });

  it("動画でないもの（拡張子だけ mp4）は通さない", async () => {
    stubFetch(Buffer.from("%PDF-1.7 not a video at all......................"), 1000);
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4")).toMatchObject({ ok: false, definitive: true });
  });

  it("100MB を超えるものは通さない（申告値ではなく実物の大きさで判定）", async () => {
    stubFetch(MP4_HEAD, 101 * 1024 * 1024);
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4")).toMatchObject({ ok: false, definitive: true });
  });

  it("中身が mp4 なのに保存パスが .mov（申告と実物の食い違い）は通さない", async () => {
    stubFetch(MP4_HEAD, 1000);
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mov")).toMatchObject({ ok: false, definitive: true });
  });

  it("保存時の形式（content-type）が中身と食い違うものは通さない（配信時にその形式で返されるため）", async () => {
    stubFetch(MP4_HEAD, 1000, 206, "text/html; charset=utf-8");
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4")).toMatchObject({ ok: false, definitive: true });
    stubFetch(MP4_HEAD, 1000, 206, "video/mp4");
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4")).toMatchObject({ ok: true });
  });

  it("Range が効かず 206 以外が返ったら、本文を読まずに「一時的に確かめられない」とする（消させない）", async () => {
    stubFetch(MP4_HEAD, 1000, 200);
    expect(await inspectStoredVideo(admin, "media/t1/c1/1_main.mp4")).toMatchObject({ ok: false, definitive: false });
  });
});
