/**
 * Generate PPTX of the JAFCO SEED 2026 pitch deck.
 *
 * Captures each of the 15 screen-mode slides as a high-resolution PNG, then
 * embeds each into a 16:9 PowerPoint slide. Preserves design fidelity exactly
 * (since slides are images, fonts/layout cannot drift across PowerPoint
 * versions).
 *
 * Usage:
 *   npm run dev               # in another terminal
 *   npx tsx scripts/export-jafco-pitch-pptx.ts
 *
 * Output:
 *   _review-pdfs/Ledra-JAFCO-SEED-2026.pptx
 */
import { chromium } from "playwright";
import pptxgen from "pptxgenjs";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.PITCH_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT_DIR = path.join(process.cwd(), "_review-pdfs");
const OUT_FILE = path.join(OUT_DIR, "Ledra-JAFCO-SEED-2026.pptx");
const TOTAL_SLIDES = 15;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const launchOpts: Parameters<typeof chromium.launch>[0] = { headless: true };
  if (fs.existsSync(CHROMIUM)) {
    launchOpts.executablePath = CHROMIUM;
  }

  console.log("🚀 Launching Chromium...");
  const browser = await chromium.launch(launchOpts);

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1920, height: 1200 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    const url = `${BASE_URL}/pitch/jafco`;
    console.log(`📄 Loading ${url}...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);

    const screenshots: Buffer[] = [];
    for (let i = 1; i <= TOTAL_SLIDES; i++) {
      console.log(`📸 Capturing slide ${i}/${TOTAL_SLIDES}...`);
      if (i > 1) {
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(400);
      }
      const slide = page.locator("div.aspect-video").first();
      const buf = await slide.screenshot({ type: "png", omitBackground: false });
      screenshots.push(buf);
    }

    console.log("📝 Assembling PPTX...");
    // pptxgen has CJS default export; in ESM/TSX it's available as default.
    const PptxGen = (pptxgen as unknown as { default?: typeof pptxgen }).default ?? pptxgen;
    const pres = new PptxGen();
    pres.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 inches (16:9)
    pres.title = "Ledra | JAFCO SEED 2026 Pitch Deck";
    pres.company = "株式会社HOLY";
    pres.author = "堀越 友輔";
    pres.subject = "JAFCO SEED 2026";

    const SLIDE_W = 13.333;
    const SLIDE_H = 7.5;

    for (let i = 0; i < screenshots.length; i++) {
      const s = pres.addSlide();
      s.background = { color: "FFFFFF" };
      s.addImage({
        data: `data:image/png;base64,${screenshots[i].toString("base64")}`,
        x: 0,
        y: 0,
        w: SLIDE_W,
        h: SLIDE_H,
        sizing: { type: "contain", w: SLIDE_W, h: SLIDE_H },
      });
    }

    await pres.writeFile({ fileName: OUT_FILE });

    const stat = fs.statSync(OUT_FILE);
    console.log(`✅ Done: ${OUT_FILE} (${(stat.size / 1024).toFixed(1)} KB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("PPTX generation failed:", err);
  process.exit(1);
});
