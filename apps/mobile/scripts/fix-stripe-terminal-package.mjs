import { access, copyFile, mkdir } from "node:fs/promises";
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

try {
  await access(target);
  console.log("Stripe Terminal SDK compatibility file already exists.");
} catch {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log("Added the Stripe Terminal SDK compatibility file.");
}
