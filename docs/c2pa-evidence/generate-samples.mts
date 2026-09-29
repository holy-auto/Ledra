// Generate C2PA conformance evidence through Ledra's real upload pipeline:
//   X-ingredient1.EXT (the uploaded file, taken from the Conformance Program's ingredient library)
//   -> stripGpsAndReadExif (EXIF/GPS removal, orientation bake-in, re-encode)
//   -> signC2pa (c2pa.opened + the upload as parentOf ingredient)
//   -> X-sample.EXT
// and read each sample back to print its validation state and actions ledger.
//
// Usage (repo root):
//   C2PA_SIGNER_CERT="$(cat es256.pub)" C2PA_SIGNER_KEY="$(cat es256.pem)" \
//   npx tsx docs/c2pa-evidence/generate-samples.mts <dir with X-ingredient1.EXT files> docs/c2pa-evidence/samples
// Test cert: c2pa-rs sdk/tests/fixtures/certs/es256.{pub,pem} (untrusted by design until conformance).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stripGpsAndReadExif } from "../../src/lib/anchoring/imageExif";
import { signC2pa } from "../../src/lib/anchoring/providers/c2pa";
import { Reader } from "@contentauth/c2pa-node";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

const [srcDir, outDir] = process.argv.slice(2);
process.env.C2PA_MODE = "production";
mkdirSync(outDir, { recursive: true });

for (const file of readdirSync(srcDir)
  .filter((f) => /^[a-z]-ingredient1\.\w+$/.test(f))
  .sort()) {
  const [letter, ext] = [file[0], file.split(".").pop()!.toLowerCase()];
  const mime = MIME[ext];
  if (!mime) throw new Error(`unsupported extension: ${file}`);
  const original = readFileSync(join(srcDir, file));
  const exif = await stripGpsAndReadExif(original);
  const res = await signC2pa(
    exif.strippedBuffer,
    mime,
    { publicId: `sample-${letter}`, captureNonce: randomUUID() },
    exif,
    original,
  );
  if (!res.signedBuffer) throw new Error(`${file}: signing produced no buffer`);
  const sample = `${letter}-sample.${ext}`;
  writeFileSync(join(outDir, sample), res.signedBuffer);
  copyFileSync(join(srcDir, file), join(outDir, file));

  const raw = (await Reader.fromAsset({ buffer: res.signedBuffer, mimeType: mime }))?.json();
  const json = (typeof raw === "string" ? JSON.parse(raw) : raw) as any;
  const m = json.manifests[json.active_manifest];
  const actions = m.assertions.find((a: { label: string }) => a.label.startsWith("c2pa.actions")).data;
  const codes = [...new Set((json.validation_status ?? []).map((c: { code: string }) => c.code))];
  const ing = m.ingredients?.[0];
  console.log(
    sample,
    json.validation_state,
    codes.join(","),
    "|",
    actions.actions.map((a: { action: string }) => a.action).join(" > "),
    "all=" + actions.allActionsIncluded,
    "| ingredient:",
    ing?.relationship,
    ing?.active_manifest ? "with C2PA manifest" : "no C2PA manifest",
  );
}
