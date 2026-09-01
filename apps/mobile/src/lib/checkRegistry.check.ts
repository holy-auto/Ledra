// *.check.ts が package.json の test に全部並んでいるかの自己チェック。
//
// test は手書きの && の連なりなので、新しい check を足したときに登録を忘れると
// **そのチェックは一度も走らないまま緑になる**。走らないチェックは無いのと同じ。
// ここが登録漏れを落とす。
//
// シェルの for ループで全部拾う案もあったが、npm script は Windows では cmd で
// 走るため壊れる。リポジトリに .ps1 があり Windows 開発者がいるので採らない。
//
// 実行: node apps/mobile/src/lib/checkRegistry.check.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as {
  scripts: { test: string };
};

const onDisk = readdirSync(here)
  .filter((f) => f.endsWith(".check.ts"))
  .sort();
const registered = (pkg.scripts.test.match(/src\/lib\/[\w.-]+\.check\.ts/g) ?? [])
  .map((p) => p.replace("src/lib/", ""))
  .sort();

const missing = onDisk.filter((f) => !registered.includes(f));
assert.deepEqual(missing, [], `package.json の test に未登録の check がある: ${missing.join(", ")}`);

const stale = registered.filter((f) => !onDisk.includes(f));
assert.deepEqual(stale, [], `package.json の test に実体の無い check が並んでいる: ${stale.join(", ")}`);

console.log(`checkRegistry.check.ts OK (${onDisk.length} 本)`);
