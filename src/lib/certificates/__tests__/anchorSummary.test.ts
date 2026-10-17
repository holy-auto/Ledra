/**
 * 「刻印あり」と数える集合・件数が、PDF が根拠を示せるアンカーに一致していることを確認する。
 *
 * ネットワークが分からない行は Polygonscan の URL を作れないので QR も探索リンクも出せない。
 * それを件数に数えると、PDF が「ほか N 枚もオンチェーン記録済み（全 M 枚）」と書きながら、
 * 読んだ人には確かめる手段が無い状態になる（`/code-review` の指摘。2026-10-17）。
 *
 * `anchorCounts` は `total` と `more` を同じ集合から出す唯一の場所なので、ここが緑なら
 * 「QR の枚数と件数が食い違う」形は作れない。
 */
import { describe, it, expect } from "vitest";
import { verifiableAnchors, anchorCounts, type AnchorLike } from "../anchorSummary";

const anchor = (over: Partial<AnchorLike> = {}): AnchorLike => ({
  sha256: "a".repeat(64),
  polygon_tx_hash: "0x" + "d".repeat(64),
  polygon_network: "polygon",
  ...over,
});

describe("verifiableAnchors", () => {
  it("tx hash とネットワークが揃っているものだけ通す", () => {
    const got = verifiableAnchors([
      anchor(), // 通る
      anchor({ polygon_network: "amoy" }), // 通る
      anchor({ polygon_network: null }), // ネットワーク不明 → URL が作れない
      anchor({ polygon_tx_hash: null }), // tx なし
      anchor({ polygon_tx_hash: "" }), // 空文字
    ]);
    expect(got.map((a) => a.polygon_network)).toEqual(["polygon", "amoy"]);
  });

  it("未設定・空配列は空を返す", () => {
    expect(verifiableAnchors(undefined)).toEqual([]);
    expect(verifiableAnchors([])).toEqual([]);
  });
});

describe("anchorCounts", () => {
  it("total と more を同じ集合から出す（ネットワーク不明の行は数えない）", () => {
    // 以前は total を tx hash の有無だけで数えていたので 5 / QR 1 枚 →
    // 「ほか 4 枚もオンチェーン記録済み（全 5 枚）」になっていた。
    const rows = [anchor(), ...Array.from({ length: 4 }, () => anchor({ polygon_network: null }))];
    const got = anchorCounts(rows, 4);
    expect(got).toMatchObject({ total: 1, shown: 1, more: 0 });
    expect(got.verifiable.length).toBe(1);
  });

  it("上限を超えた分だけ more になる（shown + more === total）", () => {
    const rows = Array.from({ length: 7 }, () => anchor());
    const got = anchorCounts(rows, 4);
    expect(got).toMatchObject({ total: 7, shown: 4, more: 3 });
    expect(got.shown + got.more).toBe(got.total);
  });

  it("上限が 0 や負でも shown + more === total を保つ", () => {
    for (const maxQr of [0, -1]) {
      const got = anchorCounts([anchor(), anchor()], maxQr);
      expect(got.shown + got.more, `maxQr=${maxQr}`).toBe(got.total);
      expect(got.more).toBeGreaterThanOrEqual(0);
    }
  });

  it("空なら全部 0", () => {
    expect(anchorCounts(undefined, 4)).toMatchObject({ total: 0, shown: 0, more: 0 });
  });
});
