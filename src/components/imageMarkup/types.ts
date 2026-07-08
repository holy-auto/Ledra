/**
 * Phase 2: 写真 Image Markup の注釈データ型。
 *
 * 設計原則:
 *   - 座標は元画像のピクセル空間で保存する (Editor 表示時はリサイズし、
 *     書き戻し時に元解像度に再投影)。
 *   - オリジナル画像のハッシュ (sha256 / perceptual_hash) は注釈に
 *     関わらず不変。アンカリングの根拠を破壊しないため、注釈は
 *     派生メタとして certificate_images.annotations に保存する。
 *   - SVG にも PDF にも同じ JSON を流し込めるよう、Konva 由来の
 *     座標表現を一旦そのまま受け入れている (path は flat 配列)。
 */

/** 5 つの形を識別するためのリテラル型。 */
export type AnnotationKind = "arrow" | "rect" | "circle" | "text" | "path";

/** 全 annotation 共通フィールド。`color` は #RRGGBB を想定。 */
export type AnnotationBase = {
  /** UUID v4 が望ましい。クライアント生成。 */
  id: string;
  kind: AnnotationKind;
  /** 描画色 (#RRGGBB)。半透明にする場合は呼び出し側で fill-opacity を別管理。 */
  color: string;
  /** 線幅 (px / 元画像座標)。1 ≤ strokeWidth ≤ 64 程度を想定。 */
  strokeWidth: number;
};

/** 矢印: 始点 (x1,y1) → 終点 (x2,y2)。終点に三角形ヘッドを描画する。 */
export type ArrowAnnotation = AnnotationBase & {
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** 矩形: 左上 (x,y) と幅高さ。塗りつぶしはしない (枠のみ)。 */
export type RectAnnotation = AnnotationBase & {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 円: 中心 (cx,cy) と半径。塗りつぶしはしない (枠のみ)。 */
export type CircleAnnotation = AnnotationBase & {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
};

/** テキスト: 左下 (x,y) を基点とする 1 行テキスト。 */
export type TextAnnotation = AnnotationBase & {
  kind: "text";
  x: number;
  y: number;
  text: string;
  /** フォントサイズ (px / 元画像座標)。 */
  fontSize: number;
};

/**
 * 自由線: フラット配列 [x0, y0, x1, y1, ...]。
 * Konva.Line の `points` 表現と同じ。最低 2 点 (= 4 要素) 必要。
 */
export type PathAnnotation = AnnotationBase & {
  kind: "path";
  points: number[];
};

export type Annotation = ArrowAnnotation | RectAnnotation | CircleAnnotation | TextAnnotation | PathAnnotation;

/**
 * 1 枚の画像に対する注釈ドキュメント。
 * DB の certificate_images.annotations にそのまま入る形。
 */
export type AnnotationDocument = {
  /** スキーマバージョン。互換破壊時にインクリメント。 */
  version: 1;
  /** 元画像の幅 (px)。SVG viewBox / 座標再投影に使う。 */
  imageWidth: number;
  /** 元画像の高さ (px)。 */
  imageHeight: number;
  /** 個別 annotation のリスト。描画順 = 配列順 (後から追加したものが上)。 */
  annotations: Annotation[];
};

/** 空ドキュメント (新規ファイル用)。 */
export function emptyAnnotationDocument(width: number, height: number): AnnotationDocument {
  return { version: 1, imageWidth: width, imageHeight: height, annotations: [] };
}

/**
 * unknown を AnnotationDocument に narrow する。
 * 座標値などは数値かどうかだけ確認し、過剰に弾かない方針。
 * 上位レイヤ (API) では Zod 等でより厳密にチェックする。
 */
export function isAnnotationDocument(value: unknown): value is AnnotationDocument {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AnnotationDocument>;
  if (v.version !== 1) return false;
  if (typeof v.imageWidth !== "number" || v.imageWidth <= 0) return false;
  if (typeof v.imageHeight !== "number" || v.imageHeight <= 0) return false;
  if (!Array.isArray(v.annotations)) return false;
  return v.annotations.every(isAnnotation);
}

function isAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const a = value as Annotation;
  if (typeof a.id !== "string" || !a.id) return false;
  if (typeof a.color !== "string" || !a.color) return false;
  if (typeof a.strokeWidth !== "number" || a.strokeWidth <= 0) return false;
  switch (a.kind) {
    case "arrow":
      return [a.x1, a.y1, a.x2, a.y2].every((n) => typeof n === "number");
    case "rect":
      return (
        typeof a.x === "number" &&
        typeof a.y === "number" &&
        typeof a.width === "number" &&
        typeof a.height === "number"
      );
    case "circle":
      return typeof a.cx === "number" && typeof a.cy === "number" && typeof a.radius === "number";
    case "text":
      return (
        typeof a.x === "number" &&
        typeof a.y === "number" &&
        typeof a.text === "string" &&
        a.text.length <= 500 &&
        typeof a.fontSize === "number"
      );
    case "path":
      // points は [x0,y0,x1,y1,...] のフラット配列。DoS 防止に上限を設ける
      // (10000 要素 = 5000 点で、手描き線としては十分)。
      return (
        Array.isArray(a.points) &&
        a.points.length >= 4 &&
        a.points.length <= 10000 &&
        a.points.every((n) => typeof n === "number")
      );
    default:
      return false;
  }
}
