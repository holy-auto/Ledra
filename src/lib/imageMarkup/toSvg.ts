/**
 * Phase 2: Image Markup
 * 注釈ドキュメント (AnnotationDocument) → SVG 文字列の変換。
 *
 * 用途:
 *   - サーバー側で sharp.composite に流して原画像へ焼き込む (render.ts)。
 *   - 公開ビュー (AnnotatedImage) で <img> の上に被せる SVG レイヤ。
 *
 * 設計:
 *   - viewBox は元画像のピクセル空間。
 *   - 出力はテキストで、外部リソース (フォント等) を参照しない。
 *     これにより sharp に渡しても CSP / CORS の問題が出ない。
 *   - テキストはユーザー入力なので必ず XML エスケープする。
 */

import type {
  Annotation,
  AnnotationDocument,
  ArrowAnnotation,
  CircleAnnotation,
  PathAnnotation,
  RectAnnotation,
  TextAnnotation,
} from "@/components/imageMarkup/types";

/** XML 特殊文字 (& < > " ') をエンティティ参照にエスケープする。 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 不正な値が紛れ込んでも SVG を破壊しないよう、color は #RRGGBB / #RGB に強制する。 */
function safeColor(color: string, fallback = "#ff3b30"): string {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback;
}

function safeNum(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/** 矢印ヘッドを描くための marker 定義 (色ごとに 1 つ作る)。 */
function arrowMarkerId(color: string): string {
  return `arrowhead-${color.replace("#", "")}`;
}

function renderArrow(a: ArrowAnnotation, markerIds: Set<string>): string {
  const color = safeColor(a.color);
  const id = arrowMarkerId(color);
  markerIds.add(id);
  const x1 = safeNum(a.x1);
  const y1 = safeNum(a.y1);
  const x2 = safeNum(a.x2);
  const y2 = safeNum(a.y2);
  const w = Math.max(0.5, safeNum(a.strokeWidth, 4));
  return (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
    `stroke="${color}" stroke-width="${w}" stroke-linecap="round" ` +
    `marker-end="url(#${id})" />`
  );
}

function renderRect(a: RectAnnotation): string {
  const color = safeColor(a.color);
  const w = Math.max(0.5, safeNum(a.strokeWidth, 4));
  return (
    `<rect x="${safeNum(a.x)}" y="${safeNum(a.y)}" ` +
    `width="${Math.max(0, safeNum(a.width))}" height="${Math.max(0, safeNum(a.height))}" ` +
    `fill="none" stroke="${color}" stroke-width="${w}" />`
  );
}

function renderCircle(a: CircleAnnotation): string {
  const color = safeColor(a.color);
  const w = Math.max(0.5, safeNum(a.strokeWidth, 4));
  return (
    `<circle cx="${safeNum(a.cx)}" cy="${safeNum(a.cy)}" r="${Math.max(0, safeNum(a.radius))}" ` +
    `fill="none" stroke="${color}" stroke-width="${w}" />`
  );
}

function renderText(a: TextAnnotation): string {
  const color = safeColor(a.color);
  const fontSize = Math.max(8, safeNum(a.fontSize, 24));
  return (
    `<text x="${safeNum(a.x)}" y="${safeNum(a.y)}" ` +
    `fill="${color}" font-family="Helvetica, Arial, sans-serif" ` +
    `font-size="${fontSize}" font-weight="700" ` +
    // 縁取りで背景写真に対して可読性を確保。順序: paint-order=stroke fill。
    `stroke="#ffffff" stroke-width="${Math.max(2, fontSize * 0.12)}" ` +
    `stroke-linejoin="round" paint-order="stroke">` +
    escapeXml(a.text) +
    `</text>`
  );
}

function renderPath(a: PathAnnotation): string {
  const color = safeColor(a.color);
  const w = Math.max(0.5, safeNum(a.strokeWidth, 3));
  if (a.points.length < 4) return "";
  let d = `M ${safeNum(a.points[0])} ${safeNum(a.points[1])}`;
  for (let i = 2; i + 1 < a.points.length; i += 2) {
    d += ` L ${safeNum(a.points[i])} ${safeNum(a.points[i + 1])}`;
  }
  return (
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ` +
    `stroke-linecap="round" stroke-linejoin="round" />`
  );
}

function renderAnnotation(a: Annotation, markerIds: Set<string>): string {
  switch (a.kind) {
    case "arrow":
      return renderArrow(a, markerIds);
    case "rect":
      return renderRect(a);
    case "circle":
      return renderCircle(a);
    case "text":
      return renderText(a);
    case "path":
      return renderPath(a);
  }
}

/**
 * 注釈ドキュメントを完全な <svg ...>...</svg> 文字列に変換する。
 *
 * - viewBox は元画像のピクセル空間。
 * - 矢印用 marker は使用色ごとに `<defs>` に出力。
 * - 注釈ゼロでも合法 SVG を返す (空のオーバーレイ)。
 *
 * ※ サーバー / クライアント両方で動くよう、外部依存ゼロ。
 */
export function annotationsToSvg(doc: AnnotationDocument): string {
  const markerIds = new Set<string>();
  const body = doc.annotations.map((a) => renderAnnotation(a, markerIds)).join("");

  const markers = Array.from(markerIds)
    .map((id) => {
      const color = `#${id.replace("arrowhead-", "")}`;
      return (
        `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" ` +
        `markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
        `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />` +
        `</marker>`
      );
    })
    .join("");

  const w = Math.max(1, Math.round(doc.imageWidth));
  const h = Math.max(1, Math.round(doc.imageHeight));
  return (
    // preserveAspectRatio=slice: <img object-cover> に重ねる公開ビューで、
    // ボックスへ伸ばしても注釈がトリミング位置とズレないようにする。
    // render.ts (sharp 焼き込み) は外側 <svg> を剥がして自前の viewBox を
    // 付け直すため、この属性の影響を受けない。
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
    `preserveAspectRatio="xMidYMid slice" ` +
    `width="${w}" height="${h}">` +
    (markers ? `<defs>${markers}</defs>` : "") +
    body +
    `</svg>`
  );
}
