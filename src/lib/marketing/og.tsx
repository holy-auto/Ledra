import { ImageResponse } from "next/og";

/**
 * Shared OG image builder for the marketing site.
 *
 * Design: dark gradient (matches Hero), brand logotype top-left, optional
 * badge chip, big title, subtitle, and the brand tagline at the bottom.
 *
 * Font loading:
 *   - satori (used by next/og) only accepts TTF/OTF, not WOFF2.
 *   - We fetch the Japanese Noto Sans JP TTF from fontsource's CDN (same
 *     source as `src/lib/pdfCertificate.tsx`). The fetch is cached by
 *     Next.js data cache; for static OG routes this happens once at build
 *     time, for dynamic ones it's deduped across requests.
 *   - On fetch failure we fall back to the default embedded font so that
 *     builds never hard-fail on OG generation.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const NOTO_SANS_JP_BOLD_TTF =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";

let cachedFontPromise: Promise<ArrayBuffer | null> | null = null;

async function loadJapaneseFont(): Promise<ArrayBuffer | null> {
  if (cachedFontPromise) return cachedFontPromise;
  cachedFontPromise = (async () => {
    try {
      const res = await fetch(NOTO_SANS_JP_BOLD_TTF, {
        // Next.js data cache: OG image generation is idempotent, so caching
        // the font for a week is safe and keeps subsequent builds fast.
        next: { revalidate: 60 * 60 * 24 * 7 },
      });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  })();
  return cachedFontPromise;
}

type OgInput = {
  title: string;
  subtitle?: string;
  badge?: string;
};

export async function makeOgImage({ title, subtitle, badge }: OgInput) {
  const tagline = "記録を、業界の共通言語にする。";
  const brand = "Ledra";

  const fontData = await loadJapaneseFont();
  const fontFamily = fontData ? "NotoSansJP" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #060a12 0%, #0b111c 45%, #0d0b1e 100%)",
          color: "white",
          fontFamily,
          position: "relative",
        }}
      >
        {/* Ambient blobs */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: "rgba(96,165,250,0.22)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -140,
            left: -120,
            width: 380,
            height: 380,
            borderRadius: 999,
            background: "rgba(167,139,250,0.18)",
            filter: "blur(80px)",
            display: "flex",
          }}
        />

        {/* Top row: brand + badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -0.5,
            }}
          >
            {brand}
          </div>
          {badge && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid rgba(96,165,250,0.3)",
                background: "rgba(96,165,250,0.12)",
                color: "#93c5fd",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 2,
              }}
            >
              {badge}
            </div>
          )}
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28, zIndex: 1, maxWidth: 920 }}>
          <div
            style={{
              fontSize: title.length > 24 ? 64 : 80,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -1,
              color: "#ffffff",
              display: "flex",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.6)",
                display: "flex",
                maxWidth: 860,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#a78bfa",
              letterSpacing: 1,
              display: "flex",
            }}
          >
            {tagline}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: 2,
              display: "flex",
            }}
          >
            WEB施工証明書SaaS
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: fontData
        ? [
            {
              name: "NotoSansJP",
              data: fontData,
              weight: 700 as const,
              style: "normal" as const,
            },
          ]
        : undefined,
    },
  );
}
