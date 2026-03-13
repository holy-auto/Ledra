import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CARTRUST — 施工証明をデジタルで";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#18181b",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#27272a",
            border: "1px solid #3f3f46",
            borderRadius: 999,
            padding: "8px 20px",
            marginBottom: 28,
          }}
        >
          <span style={{ color: "#a1a1aa", fontSize: 18, letterSpacing: 2 }}>
            施工店・保険会社向けSaaS
          </span>
        </div>

        {/* Logo */}
        <div
          style={{
            color: "#ffffff",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: -2,
            lineHeight: 1,
            marginBottom: 20,
          }}
        >
          CARTRUST
        </div>

        {/* Tagline */}
        <div
          style={{
            color: "#a1a1aa",
            fontSize: 30,
            lineHeight: 1.5,
          }}
        >
          施工証明をデジタルで。
          施工店と保険会社をつなぐプラットフォーム。
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            top: 72,
            right: 80,
            color: "#52525b",
            fontSize: 22,
          }}
        >
          cartrust.co.jp
        </div>
      </div>
    ),
    size,
  );
}
