// Generate C2PA conformance evidence samples through Ledra's real pipeline:
//   stripGpsAndReadExif (EXIF/GPS removal, orientation bake-in, re-encode)
//   -> signC2pa (production mode, ES256 test cert from c2pa-rs fixtures)
// then read each output back with c2pa-node's Reader and dump the manifest store.
// Usage (repo root): python3 docs/c2pa-evidence/make-sources.py <srcdir>  (needs pillow-heif)
//   C2PA_SIGNER_CERT="$(cat es256.pub)" C2PA_SIGNER_KEY="$(cat es256.pem)" \
//   npx tsx docs/c2pa-evidence/generate-samples.mts <srcdir> docs/c2pa-evidence/samples
// Test cert: c2pa-rs sdk/tests/fixtures/certs/es256.{pub,pem} (untrusted by design until conformance).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { stripGpsAndReadExif } from "../../src/lib/anchoring/imageExif";
import { signC2pa } from "../../src/lib/anchoring/providers/c2pa";
import { Reader } from "@contentauth/c2pa-node";
import exifr from "exifr";

const [srcDir, outDir] = process.argv.slice(2);
process.env.C2PA_MODE = "production";
mkdirSync(outDir, { recursive: true });

const SAMPLES = [
  { letter: "a", src: "src.jpg", mime: "image/jpeg", ext: "jpg" },
  { letter: "b", src: "src.png", mime: "image/png", ext: "png" },
  { letter: "c", src: "src.webp", mime: "image/webp", ext: "webp" },
  { letter: "d", src: "src.heic", mime: "image/heic", ext: "heic" },
];

const summary: unknown[] = [];
for (const s of SAMPLES) {
  const input = readFileSync(join(srcDir, s.src));
  const exif = await stripGpsAndReadExif(input);
  const res = await signC2pa(
    exif.strippedBuffer,
    s.mime,
    { publicId: `sample-${s.letter}`, captureNonce: randomUUID() },
    { reencoded: exif.reencoded, orientationApplied: exif.orientationApplied, metadataRemoved: exif.metadataRemoved },
  );
  if (!res.signedBuffer) throw new Error(`${s.mime}: signing produced no buffer`);
  const file = `${s.letter}-sample.${s.ext}`;
  writeFileSync(join(outDir, file), res.signedBuffer);

  const reader = await Reader.fromAsset({ buffer: res.signedBuffer, mimeType: s.mime });
  const raw = reader?.json();
  const json = typeof raw === "string" ? JSON.parse(raw) : raw;
  writeFileSync(join(outDir, `${s.letter}-sample.manifest.json`), JSON.stringify(json, null, 2));
  const active = json?.manifests?.[json.active_manifest];
  summary.push({
    file,
    validation_state: json?.validation_state,
    codes: [...(json?.validation_results?.activeManifest?.failure ?? []), ...(json?.validation_status ?? [])].map(
      (c: { code: string }) => c.code,
    ),
    claim_generator_info: active?.claim_generator_info,
    actions: active?.assertions?.find((a: { label: string }) => a.label.startsWith("c2pa.actions"))?.data,
    gpsInOutput: (await exifr.gps(res.signedBuffer).catch(() => undefined)) ?? null,
    exif: {
      reencoded: exif.reencoded,
      orientationApplied: exif.orientationApplied,
      metadataRemoved: exif.metadataRemoved,
      gpsReadFromSource: !!exif.gps,
    },
  });
}
console.log(JSON.stringify(summary, null, 2));
