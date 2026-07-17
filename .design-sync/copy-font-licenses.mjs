// package-build.mjs's font handling only copies files referenced via url()
// inside @font-face rules — it never touches companion license text, so the
// OFL notices required for redistributing Noto Sans JP / Geist Mono have to
// be copied into the built bundle's fonts/ directory as a separate step,
// run after package-build.mjs (not before, like buildCmd — the out dir
// doesn't exist until package-build.mjs creates it).
import fs from "node:fs";

const OUT = process.argv[2] ?? "./ds-bundle";
for (const f of ["OFL-NotoSansJP.txt", "OFL-GeistMono.txt"]) {
  fs.copyFileSync(`.design-sync/fonts/${f}`, `${OUT}/fonts/${f}`);
}
console.log(`copied font license notices into ${OUT}/fonts/`);
