/**
 * PR TIMES プレスリリース用 画像書き出しスクリプト。
 *
 * 実コンポーネント/OGP を元に、ブラウザ不要で PNG を生成する。
 * 描画パイプラインは next/og と同じ Satori + resvg。日本語は端末の
 * 日本語フォント（IPAGothic 等）を埋め込む。
 *
 *   npm i satori @resvg/resvg-js
 *   node docs/marketing/press-kit/generate.mjs
 *
 * 出力（このスクリプトと同じディレクトリ）:
 *   - ledra-ogp-1200x630.png             … メイン画像（opengraph-image.tsx の再現）
 *   - anchoring-diagram-1832x928.png     … 3層改ざん検知フロー図（PolygonAnchoringDiagram の SVG）
 *   - authenticity-badge-card-1000x520.png … 公開検証ページの真正性バッジ（AuthenticityBadge / basic）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const OUT = path.dirname(fileURLToPath(import.meta.url));

const FONT_CANDIDATES = [
  "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
  "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/Library/Fonts/Arial Unicode.ttf",
];
const FONT_PATH = FONT_CANDIDATES.find((p) => fs.existsSync(p));
if (!FONT_PATH) {
  console.error("日本語フォントが見つかりません。`apt-get install fonts-ipafont-gothic` 等で導入してください。");
  process.exit(1);
}
const font = fs.readFileSync(FONT_PATH);
// satori はスタイルの fontFamily 名と一致させればよい（フォント内部名に依存しない）
const fonts = [
  { name: "JP", data: font, weight: 400, style: "normal" },
  { name: "JP", data: font, weight: 700, style: "normal" },
];

function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style, children: kids.length <= 1 ? (kids[0] ?? null) : kids } };
}

function svgToPng(svg, { width, background } = {}) {
  return new Resvg(svg, {
    fitTo: width ? { mode: "width", value: width } : { mode: "original" },
    background: background ?? "transparent",
    font: { loadSystemFonts: true, fontFiles: [FONT_PATH], defaultFontFamily: "JP", sansSerifFamily: "JP" },
    textRendering: 2,
    shapeRendering: 2,
  })
    .render()
    .asPng();
}

/* 1) OGP 1200×630 — src/app/opengraph-image.tsx の再現 */
async function genOgp() {
  const tree = h(
    "div",
    {
      width: 1200,
      height: 630,
      background: "#18181b",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-end",
      padding: "72px 80px",
      fontFamily: "JP",
    },
    h(
      "div",
      {
        display: "flex",
        alignItems: "center",
        background: "#27272a",
        border: "1px solid #3f3f46",
        borderRadius: 999,
        padding: "8px 20px",
        marginBottom: 28,
      },
      h("div", { color: "#a1a1aa", fontSize: 18, letterSpacing: 2 }, "施工店・保険会社向けSaaS"),
    ),
    h(
      "div",
      { color: "#ffffff", fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1, marginBottom: 20 },
      "Ledra",
    ),
    h(
      "div",
      { color: "#a1a1aa", fontSize: 30, lineHeight: 1.5, display: "flex", width: 900 },
      "施工証明をデジタルで。施工店と保険会社をつなぐプラットフォーム。",
    ),
    h("div", { position: "absolute", top: 72, right: 80, color: "#52525b", fontSize: 22 }, "ledra.co.jp"),
  );
  const svg = await satori(tree, { width: 1200, height: 630, fonts });
  fs.writeFileSync(path.join(OUT, "ledra-ogp-1200x630.png"), svgToPng(svg, { width: 1200, background: "#18181b" }));
  console.log("✓ ledra-ogp-1200x630.png");
}

/* 2) 3層アンカリング フロー図 — PolygonAnchoringDiagram の SVG をダーク背景 + 2x で書き出し */
function genDiagram() {
  const PADX = 48,
    PADTOP = 44,
    PADBOT = 60;
  const innerW = 820,
    innerH = 360;
  const W = innerW + PADX * 2;
  const H = innerH + PADTOP + PADBOT;
  const node = (x, y, w, t1, t2, t3, opts = {}) => {
    const stroke = opts.chain
      ? 'stroke="rgb(167,139,250)" stroke-opacity="0.35"'
      : 'stroke="rgb(255,255,255)" stroke-opacity="0.14"';
    const grad = opts.chain ? "pa-chain" : "pa-node";
    const cx = x + w / 2;
    const t3Fill = opts.mono
      ? 'fill="rgb(167,139,250)" fill-opacity="0.7" font-family="monospace"'
      : 'fill="#ffffff" fill-opacity="0.4"';
    return `
      <rect x="${x}" y="${y}" width="${w}" height="90" rx="14" fill="url(#${grad})" ${stroke}/>
      <text x="${cx}" y="${y + 35}" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700">${t1}</text>
      <text x="${cx}" y="${y + 57}" text-anchor="middle" fill="#ffffff" fill-opacity="0.55" font-size="11">${t2}</text>
      <text x="${cx}" y="${y + 73}" text-anchor="middle" ${t3Fill} font-size="10">${t3}</text>`;
  };
  const inner = `
    <line x1="165" y1="100" x2="240" y2="100" stroke="rgb(96,165,250)" stroke-opacity="0.4" stroke-width="2" marker-end="url(#pa-arrow)"/>
    <line x1="375" y1="100" x2="460" y2="100" stroke="rgb(96,165,250)" stroke-opacity="0.4" stroke-width="2" marker-end="url(#pa-arrow)"/>
    <line x1="555" y1="145" x2="555" y2="200" stroke="rgb(96,165,250)" stroke-opacity="0.4" stroke-width="2" marker-end="url(#pa-arrow)"/>
    <line x1="465" y1="260" x2="375" y2="260" stroke="rgb(96,165,250)" stroke-opacity="0.4" stroke-width="2" marker-end="url(#pa-arrow)"/>
    <line x1="240" y1="260" x2="165" y2="260" stroke="rgb(96,165,250)" stroke-opacity="0.4" stroke-width="2" marker-end="url(#pa-arrow)"/>
    ${node(20, 55, 145, "施工店", "証明書を発行", "写真・施工内容")}
    ${node(240, 55, 135, "SHA-256", "ハッシュを計算", "0xa4f1…", { mono: true })}
    ${node(460, 55, 190, "Polygon Contract", "トランザクションに刻印", "Block #12,345,678", { chain: true })}
    ${node(460, 200, 190, "パブリック台帳に固定", "誰でも閲覧可能・書換不可", "第三者が独立に検証できる", { chain: true })}
    ${node(240, 215, 135, "ハッシュ再計算", "受領した証明書から", "一致 → 真正", { mono: true })}
    ${node(20, 215, 145, "保険会社", "証明書を受領", "真贋を即検証")}
    <text x="405" y="30" text-anchor="middle" fill="#ffffff" fill-opacity="0.5" font-size="11" font-weight="600" letter-spacing="2">ISSUANCE</text>
    <text x="405" y="340" text-anchor="middle" fill="#ffffff" fill-opacity="0.5" font-size="11" font-weight="600" letter-spacing="2">VERIFICATION</text>
    <circle cx="740" cy="100" r="60" fill="rgb(96,165,250)" fill-opacity="0.06"/>
    <circle cx="740" cy="260" r="50" fill="rgb(167,139,250)" fill-opacity="0.06"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0b0c12"/><stop offset="100%" stop-color="#15121d"/></linearGradient>
      <linearGradient id="pa-node" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgb(96,165,250)" stop-opacity="0.24"/><stop offset="100%" stop-color="rgb(167,139,250)" stop-opacity="0.12"/></linearGradient>
      <linearGradient id="pa-chain" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="rgb(167,139,250)" stop-opacity="0.28"/><stop offset="100%" stop-color="rgb(96,165,250)" stop-opacity="0.16"/></linearGradient>
      <marker id="pa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="rgb(96,165,250)" fill-opacity="0.55"/></marker>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>
    <g transform="translate(${PADX},${PADTOP})">${inner}</g>
    <text x="${W / 2}" y="${H - 24}" text-anchor="middle" fill="#ffffff" fill-opacity="0.82" font-size="16" font-weight="700">Ledra ｜ 改ざん検知：C2PA × SHA-256 × Polygon</text>
  </svg>`;
  fs.writeFileSync(path.join(OUT, "anchoring-diagram-1832x928.png"), svgToPng(svg, { width: W * 2, background: "#0b0c12" }));
  console.log("✓ anchoring-diagram-1832x928.png");
}

/* 3) 真正性バッジカード — AuthenticityBadge の basic グレード（記録ハッシュ検証済み） */
async function genBadge() {
  const dot = (color) => h("div", { width: 13, height: 13, borderRadius: 999, background: color });
  const tree = h(
    "div",
    { width: 1000, height: 520, background: "#0b0c12", display: "flex", padding: 40, fontFamily: "JP" },
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#121219",
        padding: 48,
      },
      h("div", { color: "#8b93a7", fontSize: 18, letterSpacing: 3, marginBottom: 18 }, "PUBLIC VERIFICATION ｜ 公開検証ページ"),
      h("div", { color: "#ffffff", fontSize: 36, fontWeight: 700, marginBottom: 30 }, "施工証明書の真正性"),
      h(
        "div",
        { display: "flex", alignItems: "center", marginBottom: 30 },
        h(
          "div",
          {
            display: "flex",
            alignItems: "center",
            gap: 11,
            background: "rgba(56,189,248,0.1)",
            border: "1px solid rgba(56,189,248,0.3)",
            color: "#7dd3fc",
            borderRadius: 999,
            padding: "12px 20px",
            fontSize: 23,
            fontWeight: 700,
            marginRight: 16,
          },
          dot("#38bdf8"),
          "記録ハッシュ検証済み",
        ),
        h(
          "div",
          {
            display: "flex",
            alignItems: "center",
            background: "rgba(167,139,250,0.12)",
            border: "1px solid rgba(167,139,250,0.32)",
            color: "#c4b5fd",
            borderRadius: 999,
            padding: "12px 20px",
            fontSize: 21,
            fontWeight: 700,
          },
          "Polygonscan で確認",
        ),
      ),
      h(
        "div",
        { display: "flex", width: 820, color: "#c7ccd6", fontSize: 22, lineHeight: 1.65, marginBottom: 26 },
        "写真と証明書の内容を SHA-256 でハッシュ化し、Polygon ブロックチェーンに記録。Ledra を介さず、保険会社や顧客が第三者として真正性を検証できます。",
      ),
      h("div", { display: "flex", color: "#7c8499", fontSize: 18 }, "SHA-256: 0xa4f1…3e9b  /  Polygon PoS  /  C2PA 1.3"),
    ),
  );
  const svg = await satori(tree, { width: 1000, height: 520, fonts });
  fs.writeFileSync(path.join(OUT, "authenticity-badge-card-1000x520.png"), svgToPng(svg, { width: 1000, background: "#0b0c12" }));
  console.log("✓ authenticity-badge-card-1000x520.png");
}

await genOgp();
genDiagram();
await genBadge();
console.log("done →", OUT);
