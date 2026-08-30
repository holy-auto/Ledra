/**
 * IMP-051: WCAG AA コントラスト比チェッカー（v2.0 §3.5）。
 *
 * WCAG 2.1 Success Criterion 1.4.3 (Level AA) に基づく
 * 色コントラスト比の計算と判定。デザイントークンの検証や
 * CI でのリグレッション検出に使う。
 *
 * 純関数。IO なし。
 */

// ── 色変換 ──

/**
 * hex カラー文字列を [R, G, B] (0–255) に変換。
 * #RGB, #RRGGBB 形式をサポート。
 */
export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

// ── 相対輝度 ──

/**
 * sRGB 値 (0–255) から WCAG 相対輝度 (0–1) を計算。
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const srgb = c / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// ── コントラスト比 ──

/**
 * 2 色の WCAG コントラスト比を計算（1:1 〜 21:1）。
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── WCAG AA 判定 ──

/**
 * コントラスト比が WCAG AA を満たすか判定。
 *
 * - 通常テキスト: 4.5:1 以上
 * - 大きいテキスト（18pt 以上、または 14pt 太字以上）: 3:1 以上
 * - UI コンポーネント / グラフィカルオブジェクト: 3:1 以上 (1.4.11)
 */
export function meetsWcagAA(ratio: number, context: "normal" | "large" | "ui" = "normal"): boolean {
  switch (context) {
    case "normal":
      return ratio >= 4.5;
    case "large":
    case "ui":
      return ratio >= 3.0;
  }
}

/**
 * hex カラーペアの WCAG AA 判定を一括実行。
 * デザイントークン検証のショートカット。
 */
export function checkColorPair(
  fgHex: string,
  bgHex: string,
  context: "normal" | "large" | "ui" = "normal",
): { ratio: number; passes: boolean } {
  const fg = parseHexColor(fgHex);
  const bg = parseHexColor(bgHex);
  const rawRatio = contrastRatio(fg, bg);
  // 判定は丸め前の値で行う。表示用に丸めた値で判定すると、
  // 例えば真の比率 4.4986:1（AA 未達）が 4.5 に丸まって誤って合格になる。
  return { ratio: Math.round(rawRatio * 100) / 100, passes: meetsWcagAA(rawRatio, context) };
}
