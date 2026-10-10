import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stripComments, walkSource } from "./sourceScan";

/**
 * 写真の非公開化（③）の前提: Storage の公開 URL を作るコードが Web にもモバイルにも無いこと。
 * `assets` バケットを非公開にすると公開 URL は開けなくなるので、1 つでも残っていると表示や保存済みデータが壊れる。
 * 表示には `signAssetPaths` / `createSignedAssetUrl`（src/lib/signedUrl.ts）の署名 URL を使う。
 *
 * 見る形: `getPublicUrl`（呼び出し・分割代入・改行をまたぐ書き方を含め、識別子として出てきたら）と、
 * 公開 URL のパス（`/object/public/<バケット>`、画像変換の `/render/image/public/<バケット>`）を組み立てる文字列。
 * バケット名を定数で差し込む書き方（`object/public/${BUCKET}`）も拾えるよう、バケット名までは見ない。
 * コメントは除いてから照合する（構造テストの約束）。
 */
const ROOTS = ["src", "apps/mobile/src", "scripts"];
const PATTERNS = [/\bgetPublicUrl\b/, /(object|render\/image)\/public\//];

describe("公開 URL を作るコードが無い [写真の非公開化]", () => {
  it("src・apps/mobile/src・scripts に getPublicUrl も /object/public/・/render/image/public/ も無い（コメントを除く）", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of ROOTS)
      for (const file of walkSource(root)) {
        scanned++;
        const raw = readFileSync(file, "utf8");
        // 全ファイルの字句解析は重いので、生の本文に当たったファイルだけコメントを除いて照合し直す
        if (!PATTERNS.some((re) => re.test(raw))) continue;
        stripComments(raw, file)
          .split("\n")
          .forEach((line, i) => {
            if (PATTERNS.some((re) => re.test(line))) hits.push(`${file}:${i + 1}`);
          });
      }
    // 走査が空振りしていないこと（ディレクトリ名の変更などで 0 件になっていたら検査として無効）
    expect(scanned).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  });
});
