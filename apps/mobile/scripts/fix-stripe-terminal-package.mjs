import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(mobileRoot, "node_modules/@stripe/stripe-terminal-react-native");
const source = resolve(packageRoot, "package.json");
const target = resolve(packageRoot, "lib/package.json");

try {
  await access(source);
} catch {
  console.log("Stripe Terminal SDK is not installed; compatibility fix skipped.");
  process.exit(0);
}

/** package.json の version を読む。読めなければ null（= 作り直す）。 */
async function versionOf(path) {
  try {
    return JSON.parse(await readFile(path, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

// 存在するだけでは足りない。この lib/package.json は publish されるものではなく
// このスクリプトが書いたコピーなので、SDK を上げたのに古いコピーが残っていると
// "version" / "main" / "module" / "types" が旧バージョンを指したままになる。
// npm ci は node_modules を消すので CI では起きないが、`npm install` で
// その場アップグレードする手元では起きる（2026-09-14 の beta.31→beta.32 が該当）。
const sourceVersion = await versionOf(source);
const targetVersion = await versionOf(target);

if (targetVersion !== null && targetVersion === sourceVersion) {
  console.log(`Stripe Terminal SDK compatibility file is up to date (${sourceVersion}).`);
} else {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(
    targetVersion === null
      ? "Added the Stripe Terminal SDK compatibility file."
      : `Refreshed the Stripe Terminal SDK compatibility file (${targetVersion} -> ${sourceVersion}).`,
  );
}
