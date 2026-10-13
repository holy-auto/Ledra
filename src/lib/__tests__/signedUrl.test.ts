import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: vi.fn() }));

import { signAssetPaths } from "../signedUrl";

const db = (createSignedUrls: (...a: unknown[]) => unknown) =>
  ({ storage: { from: () => ({ createSignedUrls }) } }) as never;

describe("signAssetPaths [写真の署名 URL をまとめて発行]", () => {
  it("重複と空を除いて 1 回で署名し、パスごとの URL を返す", async () => {
    const fn = vi.fn(async () => ({ data: [{ path: "a.jpg", signedUrl: "https://s/a" }], error: null }));
    const m = await signAssetPaths(db(fn), ["a.jpg", null, "a.jpg", undefined]);
    expect(fn).toHaveBeenCalledWith(["a.jpg"], 3600);
    expect(m.get("a.jpg")).toBe("https://s/a");
  });

  it("投げない: 署名が例外を出しても空の Map（公開ページを 500 にしない）", async () => {
    const m = await signAssetPaths(
      db(async () => {
        throw new Error("fetch failed");
      }),
      ["a.jpg"],
    );
    expect(m.size).toBe(0);
  });

  it("バケットを指定できる（マーケットの車両画像は market バケット）。既定は assets", async () => {
    const buckets: string[] = [];
    const dbWithBucket = {
      storage: {
        from: (b: string) => {
          buckets.push(b);
          return { createSignedUrls: async () => ({ data: [], error: null }) };
        },
      },
    } as never;
    await signAssetPaths(dbWithBucket, ["v/1.jpg"], "market");
    await signAssetPaths(dbWithBucket, ["a.jpg"]);
    expect(buckets).toEqual(["market", "assets"]);
  });

  it("パスが無ければ Storage を呼ばない", async () => {
    const fn = vi.fn();
    expect((await signAssetPaths(db(fn), [null])).size).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
