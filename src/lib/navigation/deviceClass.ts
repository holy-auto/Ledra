/**
 * デバイスクラス判定（IMP-034）。
 *
 * v2.0 §2 / §4: タブレット 2-pane レイアウトのための 3 段階ブレークポイント。
 * 既存の useIsMobile()（Sidebar.tsx, lg=1024px 二値判定）を補完し、
 * タブレット帯域を明示する。
 *
 * ponytail: React フック (useDeviceClass) は UI 層の責任。
 * ここではブレークポイント定数と純関数のみ。
 */

// ── ブレークポイント ──

/**
 * CSS ブレークポイント（min-width, px）。Tailwind 4 のデフォルトと一致。
 *
 * ponytail: 既存の Sidebar.tsx は lg=1024px を useIsMobile() で使用。
 * md=768px が Tailwind のデフォルトタブレットブレークポイント。
 * ここで値を定義し、将来 useIsMobile() もこの定数を参照するようにできる。
 */
export const BREAKPOINTS = {
  /** モバイル上限 / タブレット下限 */
  tablet: 768,
  /** タブレット上限 / デスクトップ下限（既存 lg ブレークポイントと一致） */
  desktop: 1024,
} as const;

// ── デバイスクラス ──

export const DEVICE_CLASSES = ["mobile", "tablet", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/**
 * ビューポート幅からデバイスクラスを判定する。
 *
 * - mobile: < 768px
 * - tablet: 768px ≤ width < 1024px
 * - desktop: ≥ 1024px
 */
export function resolveDeviceClass(width: number): DeviceClass {
  if (width >= BREAKPOINTS.desktop) return "desktop";
  if (width >= BREAKPOINTS.tablet) return "tablet";
  return "mobile";
}

/**
 * デバイスクラスがモバイル（タブレット含む）かを判定する。
 * ponytail: タブレットはモバイルの延長として扱う場面用。
 */
export function isMobileOrTablet(deviceClass: DeviceClass): boolean {
  return deviceClass !== "desktop";
}
