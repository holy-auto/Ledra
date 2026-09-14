import { describe, it, expect } from "vitest";
// @ts-expect-error -- .mjs スクリプトには型定義が無い
import { findOxOverrideProblems, parseVersion, compareVersions } from "./check-ox-override.mjs";

/**
 * この検査が本当に「あの失敗」を捕まえるかを確かめるテスト。
 * 検査そのものを検証していないと、緑なのに素通りしている状態に気づけない
 * （CLAUDE.md「判断の道具そのものを検証する」）。
 */

/** 2026-09-14 に実際に落ちた構成: overrides が viem の pin より古い。 */
const BROKEN = {
  packages: {
    "node_modules/ox": { version: "0.14.29" },
    "node_modules/viem": { version: "2.56.3", dependencies: { ox: "0.14.44" } },
  },
};

/** 修正後の構成。 */
const FIXED = {
  packages: {
    "node_modules/ox": { version: "0.14.44" },
    "node_modules/viem": { version: "2.54.6", dependencies: { ox: "0.14.30" } },
  },
};

describe("check-ox-override", () => {
  it("実際に落ちた構成（ox 0.14.29 / viem が 0.14.44 を要求）を検出する", () => {
    const problems = findOxOverrideProblems(BROKEN, { ox: "0.14.29" });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("viem");
    expect(problems.join("\n")).toContain("0.14.44");
  });

  it("修正後の構成は通る（viem の pin を上回るのは許す）", () => {
    expect(findOxOverrideProblems(FIXED, { ox: "0.14.44" })).toEqual([]);
  });

  it("overrides と lockfile が食い違うと検出する（作り直し忘れ）", () => {
    const problems = findOxOverrideProblems(FIXED, { ox: "0.14.30" });
    expect(problems.join("\n")).toContain("食い違う");
  });

  it("overrides に ox が無いときは何も言わない", () => {
    expect(findOxOverrideProblems(FIXED, { picomatch: "^4.0.4" })).toEqual([]);
  });

  it("ox を要求するパッケージが viem 以外に増えても見る", () => {
    const lock = {
      packages: {
        "node_modules/ox": { version: "0.14.30" },
        "node_modules/viem": { version: "2.54.6", dependencies: { ox: "0.14.30" } },
        "node_modules/other": { version: "1.0.0", dependencies: { ox: "0.14.99" } },
      },
    };
    const problems = findOxOverrideProblems(lock, { ox: "0.14.30" });
    expect(problems.join("\n")).toContain("other");
  });

  it("レンジ指定は対象外（ponytail: 素朴な x.y.z 比較のみ）", () => {
    const lock = {
      packages: {
        "node_modules/ox": { version: "0.14.30" },
        "node_modules/loose": { version: "1.0.0", dependencies: { ox: ">=0.99.0" } },
      },
    };
    expect(findOxOverrideProblems(lock, { ox: "0.14.30" })).toEqual([]);
  });

  it("バージョン比較が順序どおり", () => {
    expect(compareVersions(parseVersion("0.14.29"), parseVersion("0.14.30"))).toBeLessThan(0);
    expect(compareVersions(parseVersion("0.15.0"), parseVersion("0.14.99"))).toBeGreaterThan(0);
    expect(compareVersions(parseVersion("^1.2.3"), parseVersion("1.2.3"))).toBe(0);
    expect(parseVersion("not-a-version")).toBeNull();
  });
});
