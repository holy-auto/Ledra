import QRCode from "qrcode";

export async function qrSvgDataUrl(text: string) {
  // SVG → data URL
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, width: 256 });
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}