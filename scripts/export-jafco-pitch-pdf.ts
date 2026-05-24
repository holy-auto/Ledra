/**
 * Generate PDF of the JAFCO SEED 2026 pitch deck.
 *
 * Captures each of the 15 screen-mode slides as a single A4-landscape PNG, then
 * assembles them into a multi-page PDF. This is more reliable than relying on
 * the print-mode CSS, which Chromium sometimes collapses into fewer pages when
 * the slide heights exceed the intrinsic page size.
 *
 * Usage:
 *   npm run dev               # in another terminal
 *   npx tsx scripts/export-jafco-pitch-pdf.ts
 *
 * Output:
 *   _review-pdfs/Ledra-JAFCO-SEED-2026.pdf
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.PITCH_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const CHROMIUM =
  process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT_DIR = path.join(process.cwd(), "_review-pdfs");
const OUT_FILE = path.join(OUT_DIR, "Ledra-JAFCO-SEED-2026.pdf");

// A4 landscape: 297mm × 210mm at 96dpi = 1123 × 794. Aspect ratio 1.414.
// PitchDeck.tsx wraps each slide in `max-w-[960px] aspect-video` (16:9), which
// is 960 × 540. We render at 1600 × 900 for crisp print, then let the PDF
// scaler fit the captured PNG to one A4-landscape page.
const SLIDE_W = 1600;
const SLIDE_H = 900;
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

    // Force each slide to render at a fixed 16:9 size by overriding the
    // aspect-video container. Then capture each slide div separately.
    const screenshots: Buffer[] = [];
    for (let i = 1; i <= TOTAL_SLIDES; i++) {
      console.log(`📸 Capturing slide ${i}/${TOTAL_SLIDES}...`);

      // Navigate to the slide by clicking the slide indicator dot.
      // The screen mode renders all slides absolutely positioned with one
      // active at a time. We can switch via the bottom pagination dots.
      if (i > 1) {
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(400);
      }

      // The active slide is inside .max-w-\[960px\].aspect-video. Capture it.
      const slide = page.locator('div.aspect-video').first();
      const buf = await slide.screenshot({ type: "png", omitBackground: false });
      screenshots.push(buf);
    }

    // Build a single HTML page that places each captured PNG on its own A4-landscape page.
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: 297mm 210mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #ffffff; }
  .slide {
    width: 297mm; height: 210mm;
    display: flex; align-items: center; justify-content: center;
    page-break-after: always; break-after: page;
    background: #ffffff;
  }
  .slide:last-child { page-break-after: auto; break-after: auto; }
  .slide img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style></head><body>
${screenshots
  .map(
    (b) =>
      `<div class="slide"><img src="data:image/png;base64,${b.toString("base64")}"/></div>`
  )
  .join("\n")}
</body></html>`;

    console.log("📝 Assembling PDF from captured slides...");
    const pdfPage = await ctx.newPage();
    await pdfPage.setContent(html, { waitUntil: "load" });
    await pdfPage.emulateMedia({ media: "print" });
    await pdfPage.waitForTimeout(500);

    await pdfPage.pdf({
      path: OUT_FILE,
      width: "297mm",
      height: "210mm",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: true,
    });

    const stat = fs.statSync(OUT_FILE);
    console.log(`✅ Done: ${OUT_FILE} (${(stat.size / 1024).toFixed(1)} KB)`);
  } finally {
    await browser.close();
  }
}

// Silence eslint about unused but documented constants.
void SLIDE_W;
void SLIDE_H;

main().catch((err) => {
  console.error("PDF generation failed:", err);
  process.exit(1);
});
