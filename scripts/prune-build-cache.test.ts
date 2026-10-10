import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- .mjs スクリプトには型定義が無い
import { planTurbopackPrune, pruneBuildCache } from "./prune-build-cache.mjs";

describe("planTurbopackPrune", () => {
  it("Next を上げた後に残った古い版だけを消す", () => {
    expect(planTurbopackPrune(["v16.3.5-1a2b3c4d", "v16.3.8-b0fad0d4"], "16.3.8")).toEqual({
      keep: ["v16.3.8-b0fad0d4"],
      remove: ["v16.3.5-1a2b3c4d"],
    });
  });

  it("今の版に当たるものが無ければ何も消さない（命名が変わっても今のキャッシュを壊さない）", () => {
    expect(planTurbopackPrune(["v16.3.8-b0fad0d4"], "16.4.0").remove).toEqual([]);
    expect(planTurbopackPrune(["cache-xyz"], "16.3.8").remove).toEqual([]);
  });

  it("16.3.8 の版を 16.3.80 と取り違えない", () => {
    expect(planTurbopackPrune(["v16.3.80-aaaa", "v16.3.8-bbbb"], "16.3.8").remove).toEqual(["v16.3.80-aaaa"]);
  });
});

describe("pruneBuildCache", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prune-build-cache-"));
    mkdirSync(join(root, "node_modules", "next"), { recursive: true });
    writeFileSync(join(root, "node_modules", "next", "package.json"), JSON.stringify({ version: "16.3.8" }));
    for (const d of ["v16.3.5-old", "v16.3.8-cur"]) {
      mkdirSync(join(root, ".next", "cache", "turbopack", d), { recursive: true });
      writeFileSync(join(root, ".next", "cache", "turbopack", d, "00000001.sst"), "x");
    }
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("古い版のディレクトリを消し、今の版は残し、大きさをログに出す", () => {
    const { removed, report } = pruneBuildCache(root);
    expect(existsSync(join(root, ".next", "cache", "turbopack", "v16.3.5-old"))).toBe(false);
    expect(existsSync(join(root, ".next", "cache", "turbopack", "v16.3.8-cur", "00000001.sst"))).toBe(true);
    expect(removed).toHaveLength(1);
    expect(report.join("\n")).toMatch(/\[build-cache\] .next\/cache \d+MB/);
  });

  it("キャッシュが無い（初回ビルド）でも落ちない", () => {
    rmSync(join(root, ".next"), { recursive: true, force: true });
    expect(pruneBuildCache(root).removed).toEqual([]);
  });
});
