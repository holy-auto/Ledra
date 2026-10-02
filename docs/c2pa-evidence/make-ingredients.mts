// Build the X-ingredient1.EXT inputs for the evidence samples.
// The Conformance Program library ships image ingredients only as JPEG and PNG; they are used as-is.
// WebP and HEIC are not in the library, so (as the Program instructs) they are made from the library
// JPEG and C2PA-signed with the c2pa-rs test certificate: c2pa.opened (the library JPEG as parentOf
// ingredient) + c2pa.transcoded — so their provenance points back to the library file.
//
// Usage (repo root; HEIC encoding needs `pip install pillow-heif`):
//   npx tsx docs/c2pa-evidence/make-ingredients.mts <library dir> <out dir> <es256.pub> <es256.pem>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { Builder, LocalSigner } from "@contentauth/c2pa-node";

const [lib, out, certPath, keyPath] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const signer = LocalSigner.newSigner(readFileSync(certPath), readFileSync(keyPath), "es256", undefined);
const libJpg = join(lib, "sample-X-ingredientN.jpg");

copyFileSync(libJpg, join(out, "a-ingredient1.jpg"));
copyFileSync(join(lib, "sample-X-ingredientN.png"), join(out, "b-ingredient1.png"));

async function transcodeAndSign(bytes: Buffer, mime: string, file: string) {
  const b = Builder.withJson({
    claim_generator_info: [{ name: "Ledra evidence ingredient maker", version: "1.0", specVersion: "2.4" }],
    title: file,
    assertions: [
      {
        label: "c2pa.actions",
        created: true,
        data: {
          allActionsIncluded: true,
          actions: [
            { action: "c2pa.opened", parameters: { ingredientIds: ["library"] } },
            { action: "c2pa.transcoded" },
          ],
        },
      },
    ],
  } as never);
  await b.addIngredient(
    JSON.stringify({ title: "sample-X-ingredientN.jpg", relationship: "parentOf", label: "library" }),
    { buffer: readFileSync(libJpg), mimeType: "image/jpeg" },
  );
  const o: { buffer: Buffer | null } = { buffer: null };
  b.sign(signer, { buffer: bytes, mimeType: mime }, o);
  writeFileSync(join(out, file), o.buffer!);
}

await transcodeAndSign(
  await sharp(libJpg).rotate().webp({ quality: 90 }).toBuffer(),
  "image/webp",
  "c-ingredient1.webp",
);

const heicPath = join(out, "tmp-unsigned.heic");
execFileSync("python3", [
  "-c",
  "import sys,pillow_heif; from PIL import Image, ImageOps; pillow_heif.from_pillow(ImageOps.exif_transpose(Image.open(sys.argv[1]))).save(sys.argv[2], quality=90)",
  libJpg,
  heicPath,
]);
await transcodeAndSign(readFileSync(heicPath), "image/heic", "d-ingredient1.heic");
execFileSync("rm", ["-f", heicPath]);
console.log("ingredients written to", out);
