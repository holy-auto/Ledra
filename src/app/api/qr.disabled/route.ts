import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") ?? "";
  const sizeStr = searchParams.get("size") ?? "220";
  const size = Math.max(120, Math.min(800, Number(sizeStr) || 220));

  if (!text) {
    return NextResponse.json({ error: "missing text" }, { status: 400 });
  }

  const svg = await QRCode.toString(text, {
    type: "svg",
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}