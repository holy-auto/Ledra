/**
 * Server-only font loader for marketing PDFs.
 *
 * Reads the Japanese-subset Noto Sans JP TTF files shipped under
 * `public/fonts/` and exposes them as data URLs, so that
 * `@react-pdf/renderer` can register them without an outbound HTTP call.
 *
 * TTF is preferred over WOFF because fontkit decompresses WOFF on every
 * `renderToBuffer` call, which can add tens of seconds per PDF for large
 * Japanese glyph sets. The registry caches each encoded data URL per weight
 * so the file is only read once per process.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

type FontWeight = 400 | 700;

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

const FILES: Record<FontWeight, string> = {
  400: "NotoSansJP-400.ttf",
  700: "NotoSansJP-700.ttf",
};

const cache = new Map<FontWeight, string>();

export function notoSansJpDataUrl(weight: FontWeight): string {
  const cached = cache.get(weight);
  if (cached) return cached;

  const bytes = readFileSync(path.join(FONT_DIR, FILES[weight]));
  const url = `data:font/ttf;base64,${bytes.toString("base64")}`;
  cache.set(weight, url);
  return url;
}
