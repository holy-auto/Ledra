import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  function binaryPath(): string | null {
    // パッケージ自体が入っていない環境では `resolve` が MODULE_NOT_FOUND を投げる
    // （optionalDependencies なので起こりうる）。解決スタックではなく、下の
    // 「何も見ていない」というメッセージで落としたいので null を返す。
    try {
      return path.join(path.dirname(require_.resolve("@contentauth/c2pa-node")), "index.node");
    } catch {
      return null;
    }
  }

  function run(env: Record<string, string | undefined>, cwd: string = ROOT): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [SCRIPT], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // **継承した C2PA_MODE を必ず上書きする。** 親から漏れると、
        // 「未設定なら skip」のケースが別の条件を見てしまう。
        // **継承した C2PA_MODE / NODE_ENV を必ず落とす。** 親（vitest）は NODE_ENV=test なので、
        // 残ると @next/env がモードを test にして `.env.local` を読まなくなる
        // —— 本物のビルドシェル（NODE_ENV 未設定）と条件が変わってしまう。
        env: {
          ...process.env,
          C2PA_MODE: undefined,
          C2PA_LIBRARY_PATH: undefined,
          NODE_ENV: undefined,
          ...env,
        },
      });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  }

  /**
   * `.env` を置いた**使い捨てディレクトリ**を cwd にして走らせる。
   *
   * **リポジトリ直下に `.env.local` を書いてはいけない。** 初版はそうしていて、
   * `/code-review` が2つの実害を示した: (1) README が `cp .env.example .env.local` と
   * 言っているので、**手順どおり用意した開発機ではこのテストが必ず落ちる**。
   * (2) `ci-parallel-checks.sh` は10本を同時に走らせるので、`test:coverage` が直下に
   * `C2PA_MODE=production` を書いている間に `check:c2pa-binary` がそれを読む。
   * さらにワーカーが SIGKILL されると `finally` が走らず、**gitignore された
   * `.env.local` が `C2PA_MODE=production` のまま残る**（git status には出ない）。
   *
   * スクリプトはパッケージを `createRequire(import.meta.url)`（＝自分の置き場所）で
   * 解くので、cwd がどこでも `@contentauth/c2pa-node` は見つかる。
   */
  function runWithEnvFile(
    files: Record<string, string>,
    env: Record<string, string | undefined> = {},
  ): { code: number; out: string } {
    const dir = mkdtempSync(path.join(tmpdir(), "c2pa-env-"));
    try {
      for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
      return run(env, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
    const bin = binaryPath();
    expect(
      bin !== null && existsSync(bin),
      "ネイティブバイナリが無い環境では、この検査自体が何も見ていない",
    ).toBe(true);
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

  it(".env 系から C2PA_MODE を読む（手順書は .env に書けと言っている）", () => {
    // `next build` は env ファイルを読むが素の `node` は読まない。process.env だけ見ていると
    // **手順書どおり設定した人のところで黙ってスキップ**する。
    for (const body of [
      "C2PA_MODE=production",
      'C2PA_MODE="production"',
      "export C2PA_MODE='production'",
      "# C2PA_MODE=disabled\nC2PA_MODE=production",
      "OTHER=1\nC2PA_MODE=production\nMORE=2",
    ]) {
      const { code, out } = runWithEnvFile({ ".env": `${body}\n` });
      expect(code, `${JSON.stringify(body)} で落ちた: ${out}`).toBe(0);
      expect(out, `${JSON.stringify(body)} を production と読めていない`).toMatch(/OK —/);
    }
    // 本物の環境変数が .env より強いこと（next と同じ優先順）。
    const { out } = runWithEnvFile({ ".env": "C2PA_MODE=production\n" }, { C2PA_MODE: "disabled" });
    expect(out, "process.env が .env に負けている").toMatch(/skip/);
    // `.env.local` が `.env` に勝つこと（NODE_ENV 未設定＝本物のビルドシェルの条件）。
    const local = runWithEnvFile({ ".env": "C2PA_MODE=disabled\n", ".env.local": "C2PA_MODE=production\n" });
    expect(local.out, ".env.local が .env に負けている").toMatch(/OK —/);
    // **NODE_ENV=test では `.env.local` を読まない。** これは @next/env の仕様
    // （`d !== "test" && ".env.local"`）で、同じシェルで走る `next build` も同じ挙動になる。
    // 検査が production を強制すると、ここでビルドとずれる。
    const inTest = runWithEnvFile(
      { ".env": "C2PA_MODE=disabled\n", ".env.local": "C2PA_MODE=production\n" },
      { NODE_ENV: "test" },
    );
    expect(inTest.out, "NODE_ENV=test なのに .env.local を読んでいる＝next build とずれる").toMatch(/skip/);
  });

  /**
   * **ここが本体。** 自前パーサは dotenv と3つ外れていて、**3つとも「黙ってスキップ」**だった
   * （`/code-review` が実測、2026-10-08）。`@next/env` を next 経由で使う形に替えて塞いだ。
   * 自前パーサに戻すと、この3ケースが赤になる。
   */
  it("dotenv と同じ読み方をする（自前パーサが外していた3ケース）", () => {
    const cases: Array<[string, string]> = [
      // `.env.example` は C2PA_MODE=disabled を含む。手順書どおり末尾に足すとこの形になる。
      // dotenv は**後の行**を採る。自前パーサは先の行を採って skip していた。
      ["同じキーが2行あるとき後の行が勝つ", "C2PA_MODE=disabled\nC2PA_MODE=production\n"],
      // dotenv は引用無しの値を `#` で切る。自前パーサは `production # 本番` を読んでいた。
      ["行内コメントを値に含めない", "C2PA_MODE=production # 本番\n"],
      // 引用符の外にコメントがあると、自前の `^(["']).*\1$` が外れて引用符ごと読んでいた。
      ["引用符＋行内コメント", 'C2PA_MODE="production" # x\n'],
    ];
    for (const [label, body] of cases) {
      const { code, out } = runWithEnvFile({ ".env": body });
      expect(code, `${label}: 落ちた: ${out}`).toBe(0);
      expect(out, `${label}: production と読めていない（黙ってスキップしている）`).toMatch(/OK —/);
    }
  });

  /**
   * **両側を同じ入力で走らせて比べる。** これが parity テストの本体である。
   *
   * 片側（ゲートが落ちるか）だけを見るテストは、**間違った理由で落ちている実装も通す**
   * （例: 空文字を `path.resolve(distDir, "")` と解くと dist ディレクトリ自体になり、
   * `require(dir)` が別の例外で落ちて exit 1 になる —— 片側テストは緑のまま）。
   * `M-20261008-swapped-a-parity-having-impl-for-my-own-parser` の再発防止として
   * 「両方を同じ入力で走らせて出力を比べる」と決めたのに、`C2PA_LIBRARY_PATH` 側は
   * 片側しか見ていなかった（`M-20261009-parity-test-covered-the-parser-and-missed-the-override`）。
   */
  it("C2PA_LIBRARY_PATH の扱いがパッケージ側と一致する（両側を同じ入力で走らせる）", () => {
    const dist = path.dirname(require_.resolve("@contentauth/c2pa-node"));
    // あちら（`dist/binary.js:22`）と同じ位置・同じ式を再現する。
    const requirePkg = createRequire(path.join(dist, "binary.js"));
    const pkgSide = (override: string | undefined): string | null => {
      try {
        requirePkg(override ?? "./index.node");
        return null; // ロードできた
      } catch (e) {
        return (e as { code?: string }).code ?? "UNKNOWN";
      }
    };

    const inputs: Array<string | undefined> = [
      undefined,
      "", // `??` は空文字を置き換えない → require("") が ERR_INVALID_ARG_VALUE
      "./index.node", // あちらの既定値そのもの（dist/ 基準の相対）
      "index.node", // 裸の指定子。node_modules から解かれるので見つからない
      "/nonexistent/nope.node",
      "@nonexistent-scope/c2pa-binary",
    ];

    for (const override of inputs) {
      const pkgErr = pkgSide(override);
      const { code, out } = run({ C2PA_MODE: "production", C2PA_LIBRARY_PATH: override });
      const label = `C2PA_LIBRARY_PATH=${override === undefined ? "(未設定)" : JSON.stringify(override)}`;
      // ロードできる入力ではゲートも緑、落ちる入力ではゲートも赤であること。
      expect(code, `${label}: パッケージは ${pkgErr ?? "ロード成功"} なのにゲートは exit ${code}\n${out}`).toBe(
        pkgErr === null ? 0 : 1,
      );
      // **落ちる理由まで一致していること。** 別の例外で落ちているなら parity ではない。
      if (pkgErr !== null) {
        expect(out, `${label}: 落ちた理由が違う（あちらは ${pkgErr}）`).toContain(pkgErr);
      }
    }
  });

  it("C2PA_MODE が実 env でも .env の C2PA_LIBRARY_PATH を読む", () => {
    // 早期 return にしていたら、`C2PA_MODE` を実 env で渡し override を `.env` に書いた構成で
    // **override がゲートから見えず、next とランタイムだけが拾う**状態になっていた。
    // 同じ `.env` が `C2PA_MODE` の出所だけで exit 0 と exit 1 に分かれていた（/code-review 指摘）。
    // しかもそれは手順書と ponytail が推奨している構成（env を Build にも露出）そのもの。
    const broken = { ".env": "C2PA_LIBRARY_PATH=/nonexistent/nope.node\n" };
    const viaRealEnv = runWithEnvFile(broken, { C2PA_MODE: "production" });
    expect(viaRealEnv.code, `実 env の C2PA_MODE だと .env の override を見ていない: ${viaRealEnv.out}`).toBe(1);
    // 両方 .env に書いた場合も同じ結果（出所で結果が変わらないこと）。
    const viaEnvFile = runWithEnvFile({
      ".env": `C2PA_MODE=production\n${broken[".env"]}`,
    });
    expect(viaEnvFile.code, `両方 .env の場合: ${viaEnvFile.out}`).toBe(1);
  });

  it("実 env の C2PA_MODE は .env より強い（.env を読んでも優先順は変わらない）", () => {
    // 修正1で `.env` を必ず読むようにしたが、**実 env の優先は崩していない**ことを見張る。
    const { out } = runWithEnvFile({ ".env": "C2PA_MODE=production\n" }, { C2PA_MODE: "disabled" });
    expect(out, "process.env が .env に負けている").toMatch(/skip/);
  });

  it("裸の指定子の C2PA_LIBRARY_PATH は dist/ 基準で解かない（node_modules から解く側に合わせる）", () => {
    // `@scope/pkg` のような指定子は、パッケージ側の `require` も node_modules から解く。
    // `dist/` 基準で解くと存在しないパスになり、**パッケージは読めるのに検査だけ落ちる**。
    // ここでは「`dist/@scope/...` を探した」形跡が無いことを見る（落ちること自体は正しい）。
    const { code, out } = run({ C2PA_MODE: "production", C2PA_LIBRARY_PATH: "@nonexistent-scope/c2pa-binary" });
    expect(code, `落ちなかった: ${out}`).toBe(1);
    expect(out, "裸の指定子を dist/ 基準のパスに変えている").not.toMatch(/dist[/\\]@nonexistent-scope/);
  });

  it("相対の C2PA_LIBRARY_PATH は dist/ 基準で解く（パッケージと同じ基準）", () => {
    // `dist/binary.js` の既定値そのもの。`scripts/` 基準で解くと落ちてしまい、
    // パッケージは読めるのにビルドが通らなくなる（/code-review が実測した退行）。
    const { code, out } = run({ C2PA_MODE: "production", C2PA_LIBRARY_PATH: "./index.node" });
    expect(code, `相対パスを scripts/ 基準で解いている: ${out}`).toBe(0);
    expect(out).toMatch(/OK —/);
  });
});
