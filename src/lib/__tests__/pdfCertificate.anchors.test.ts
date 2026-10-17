/**
 * 「刻印あり」と数える集合が、PDF が根拠を示せるアンカーに一致していることを確認する。
 *
 * ネットワークが分からない行は Polygonscan の URL を作れないので QR も探索リンクも出せない。
 * それを件数に数えると、PDF が「ほか N 枚もオンチェーン記録済み（全 M 枚）」と書きながら、
 * 読んだ人には確かめる手段が無い状態になる（`/code-review` の指摘。2026-10-17）。
 */
import { describe, it, expect } from "vitest";
import { verifiableAnchors, type AnchorInfo } from "../pdfCertificate";

const anchor = (over: Partial<AnchorInfo>): AnchorInfo => ({
  sha256: "a".repeat(64),
  polygon_tx_hash: "0x" + "d".repeat(64),
  polygon_network: "polygon",
  ...over,
});

describe("verifiableAnchors", () => {
  it("tx hash とネットワークが揃っているものだけ通す", () => {
    const got = verifiableAnchors([
      anchor({}), // 通る
      anchor({ polygon_network: "amoy" }), // 通る
      anchor({ polygon_network: null }), // ネットワーク不明 → QR が作れない
      anchor({ polygon_tx_hash: null }), // tx なし
      anchor({ polygon_tx_hash: "" }), // 空文字
    ]);
    expect(got.length).toBe(2);
    expect(got.map((a) => a.polygon_network)).toEqual(["polygon", "amoy"]);
  });

  it("未設定・空配列は空を返す", () => {
    expect(verifiableAnchors(undefined)).toEqual([]);
    expect(verifiableAnchors([])).toEqual([]);
  });

  it("ネットワーク不明の行は件数に数えない（「ほか N 枚」の母数）", () => {
    // tx hash だけで数えていた頃は 5 件になり、QR は 1 件しか出ないので
    // 「ほか 4 枚もオンチェーン記録済み（全 5 枚）」と書いていた。
    const rows = [anchor({}), ...Array.from({ length: 4 }, () => anchor({ polygon_network: null }))];
    expect(rows.length).toBe(5);
    expect(verifiableAnchors(rows).length).toBe(1);
  });
});
