/**
 * Ledra Design Tokens — Mobile
 *
 * Single source for all visual tokens in the mobile app.
 * Matches the canonical Ledra visual rules from v2.0 spec + UI Redesign Guide.
 *
 * ponytail: All values are literals so RN StyleSheet can inline them at build time.
 */

// ─── Colors ──────────────────────────────────────────────────────────
export const colors = {
  // Core
  primary: "#155EEF",
  primaryLight: "#EBF2FF",
  primaryDark: "#0D47C9",

  // Surfaces
  background: "#F6F7F9",
  surface: "#FFFFFF",
  surfaceVariant: "#F1F3F5",

  // Text
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  textOnPrimary: "#FFFFFF",
  textOnDanger: "#FFFFFF",

  // Semantic state
  success: "#10B981",
  successLight: "#ECFDF5",
  successDark: "#059669",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  warningDark: "#D97706",
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  dangerDark: "#DC2626",
  info: "#6366F1",
  infoLight: "#EEF2FF",
  infoDark: "#4F46E5",

  // Chrome
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  divider: "#E2E8F0",
  overlay: "rgba(15, 23, 42, 0.5)",
  shadow: "rgba(15, 23, 42, 0.08)",

  // Navigation
  tabActive: "#155EEF",
  tabInactive: "#94A3B8",
  tabBarBg: "#FFFFFF",
} as const;

// ─── Typography (sizes in px) ────────────────────────────────────────
export const typography = {
  hero: { fontSize: 28, lineHeight: 36, fontWeight: "700" as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const },
  titleMedium: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  titleSmall: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const },
  labelSmall: { fontSize: 13, lineHeight: 16, fontWeight: "500" as const },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  card: 20,
  hero: 24,
  full: 9999,
} as const;

// ─── Sizing ──────────────────────────────────────────────────────────
export const sizing = {
  touchTarget: 44,
  ctaHeight: 52,
  ctaHeightSmall: 44,
  iconSm: 20,
  iconMd: 24,
  iconLg: 32,
  // タブバーの中身の高さ（丸ボタン + ラベル + 上下パディング）。
  // セーフエリアは含まない。実高さは _layout.tsx で insets.bottom を足して決める
  tabBarHeight: 80,
  tabIconSize: 24,
  // タブの丸ボタン直径。tabBarHeight とセットで動かすこと
  tabIconCircle: 48,
  // 中央の + ボタンがタブバーより上に張り出す分（余白8 + 直径60 + 余白8）。
  // タブ配下のスクロール内容の下余白に使い、最後の行が + に隠れないようにする
  fabClearance: 76,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────
export const shadows = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHover: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  fab: {
    shadowColor: "#155EEF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
