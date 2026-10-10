import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 写真の非公開化（③）の前提: Storage の公開 URL（`.getPublicUrl(`）を作るコードが Web にもモバイルにも無いこと。
 * `assets` バケットを非公開にすると公開 URL は開けなくなるので、1 つでも残っていると表示や保存済みデータが壊れる。
 * 表示には `signAssetPaths` / `createSignedAssetUrl`（src/lib/signedUrl.ts）の署名 URL を使う。
 */
const ROOTS = ["src", "apps/mobile/src"];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

describe("公開 URL を作るコードが無い [写真の非公開化]", () => {
  it("src・apps/mobile/src に .getPublicUrl( の呼び出しが無い", () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const root of ROOTS)
      for (const file of walk(root)) {
        scanned++;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/\.getPublicUrl\s*\(/.test(line)) hits.push(`${file}:${i + 1}`);
          });
      }
    // 走査が空振りしていないこと（ディレクトリ名の変更などで 0 件になっていたら検査として無効）
    expect(scanned).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  });
});
