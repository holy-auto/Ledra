import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * `scripts/check-c2pa-binary.mjs` の3つの出口を外から確かめる。
 *
 * ## なぜ要るか
 *
 * このスクリプトは **`next build` の前段に置いてあり、exit 1 でデプロイを止める**。
 * 初版は手で1回ずつ叩いただけで出したところ、`/code-review` が実測で2つの誤りを出した:
 *
 * - `C2PA_LIBRARY_PATH` の相対パスを `scripts/` 基準で解いていた。パッケージ側は
 *   `dist/` 基準なので、**パッケージは読めるのにこの検査だけが落ちてビルドが通らない**。
 * - `import()` して API 形状を見るだけでは、バイナリを消しても通った
 *   （`getNeonBinary()` は初回アクセス時の遅延ロード）。
 *
 * どちらも「3条件を外から走らせる」テストがあれば初回で出た。
 * CLAUDE.md の「非自明なロジックは、壊れたら落ちる最小の検査を1つ残す」をここで払う。
 *
 * ## 作り
 *
 * スクリプトを**子プロセスとして起動**し、終了コードと出力を見る。env の読み方
 * （`.env` 系も読む）や `require` の解決基準は、親プロセスに import すると再現できない。
 */
describe("check-c2pa-binary.mjs", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const SCRIPT = path.join(ROOT, "scripts", "check-c2pa-binary.mjs");

  /** 実バイナリの場所。無い環境ではその旨で落とす（skip にしない＝fail-closed の方針に合わせる）。 */
  const require_ = createRequire(path.join(ROOT, "package.json"));
  function binaryPath(): string {
    const dist = path.dirname(require_.resolve("@contentauth/c2pa-node"));
    return path.join(dist, "index.node");
  }

  function run(env: Record<string, string | undefined>): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [SCRIPT], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // **継承した C2PA_MODE を必ず上書きする。** 親から漏れると、
        // 「未設定なら skip」のケースが別の条件を見てしまう。
        env: { ...process.env, C2PA_MODE: undefined, C2PA_LIBRARY_PATH: undefined, ...env },
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }

  it("C2PA_MODE が production 以外なら、何も見ずに成功する", () => {
    for (const mode of [undefined, "disabled", "dev-signed", "Production"]) {
      const { code, out } = run({ C2PA_MODE: mode });
      expect(code, `C2PA_MODE=${String(mode)} で落ちた: ${out}`).toBe(0);
      expect(out).toMatch(/skip/);
    }
  });

  it("production でバイナリがあれば成功する", () => {
    expect(existsSync(binaryPath()), "ネイティブバイナリが無い環境では、この検査自体が何も見ていない").toBe(
      true,
    );
    const { code, out } = run({ C2PA_MODE: "production" });
    expect(code, out).toBe(0);
    expect(out).toMatch(/OK —/);
  });

  it("production でバイナリを指せなければ exit 1 で落ちる", () => {
    const missing = path.join(mkdtempSync(path.join(tmpdir(), "c2pa-missing-")), "index.node");
    const { code, out } = run({ C2PA_MODE: "production", C2PA_LIBRARY_PATH: missing });
    expect(code, `落ちなかった。この検査が無効なら、バイナリ無しのまま本番に出る: ${out}`).toBe(1);
    // 原因の当たりが付く出力であること（ここが分からないと止めても意味がない）。
    expect(out).toMatch(/全件 503/);
    expect(out).toMatch(/Skipping Rust build/);
  });

  it("相対の C2PA_LIBRARY_PATH は dist/ 基準で解く（パッケージと同じ基準）", () => {
    // `dist/binary.js` の既定値そのもの。`scripts/` 基準で解くと落ちてしまい、
    // パッケージは読めるのにビルドが通らなくなる（/code-review が実測した退行）。
    const { code, out } = run({ C2PA_MODE: "production", C2PA_LIBRARY_PATH: "./index.node" });
    expect(code, `相対パスを scripts/ 基準で解いている: ${out}`).toBe(0);
    expect(out).toMatch(/OK —/);
  });
});
