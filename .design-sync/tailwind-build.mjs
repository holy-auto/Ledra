// Compiles src/app/globals.css (Tailwind v4 + Ledra design tokens) into a
// fully-resolved stylesheet for cfg.cssEntry. Tailwind v4 needs real
// compilation to materialize utility classes referenced by className
// strings across src/ — the raw source alone only has @import + tokens.
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs";

const input = fs.readFileSync("src/app/globals.css", "utf8");
const result = await postcss([tailwindcss()]).process(input, {
  from: "src/app/globals.css",
  to: ".design-sync/.cache/compiled.css",
});
// Bridges the CSS vars next/font/google injects at runtime in the real app
// (--font-noto-sans, --font-geist-mono on <html>/<body>, src/app/layout.tsx)
// so the var(--font-noto-sans, "Noto Sans JP") / var(--font-geist-mono, …)
// fallback chains resolve to the families shipped via cfg.extraFonts
// (.design-sync/fonts/fonts.css) instead of skipping to system fallbacks.
const fontVarBridge = fs.readFileSync(".design-sync/runtime-font-vars.css", "utf8");

fs.mkdirSync(".design-sync/.cache", { recursive: true });
fs.writeFileSync(".design-sync/.cache/compiled.css", result.css + "\n" + fontVarBridge);
console.log("wrote", result.css.length, "bytes to .design-sync/.cache/compiled.css");
