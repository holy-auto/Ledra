/**
 * 正準タブ定義（IMP-020）。
 *
 * v2.0 §2: モバイル下部ナビは Home / 作業 / 車両 / 証明 / その他 で固定
 * （製品不変条件 #2）。
 *
 * Web 管理画面のモバイルタブバー（MobileTabBar）と Expo モバイルアプリの
 * 両方がこの定義を参照する単一定義源。
 */

// ── 正準タブ ID ──

export const CANONICAL_TABS = ["home", "work", "vehicles", "certificates", "more"] as const;
export type CanonicalTab = (typeof CANONICAL_TABS)[number];

// ── Web 管理画面タブ定義 ──

export type WebTab = {
  id: CanonicalTab;
  href: string;
  label: string;
};

/**
 * Web 管理画面のモバイルタブバー用定義。
 *
 * アイコンは NAV_GROUPS（adminNav.tsx）から取得するため href のみ定義。
 * 権限ゲートも NAV_GROUPS 側の requiredPermission に従う。
 */
export const WEB_TABS: readonly WebTab[] = [
  { id: "home", href: "/admin", label: "ホーム" },
  { id: "work", href: "/admin/reservations", label: "作業" },
  { id: "vehicles", href: "/admin/vehicles", label: "車両" },
  { id: "certificates", href: "/admin/certificates", label: "証明書" },
  { id: "more", href: "/admin/settings", label: "その他" },
] as const;

// ── Expo モバイルタブ定義 ──

export type MobileTab = {
  id: CanonicalTab;
  /** Expo Router の Tabs.Screen name（(tabs) 内のディレクトリ名） */
  screenName: string;
  label: string;
  /** react-native-paper Icon の source（focused / unfocused） */
  icon: { focused: string; unfocused: string };
};

/**
 * Expo モバイルアプリのタブ定義。
 *
 * ponytail: アイコン名は react-native-paper の MaterialCommunityIcons。
 * 実際の Tabs.Screen レンダリングは _layout.tsx 側で行う。
 * ここはデータのみ（React import なし）。
 */
export const MOBILE_TABS: readonly MobileTab[] = [
  { id: "home", screenName: "index", label: "ホーム", icon: { focused: "home", unfocused: "home-outline" } },
  { id: "work", screenName: "work", label: "作業", icon: { focused: "wrench", unfocused: "wrench-outline" } },
  {
    id: "vehicles",
    screenName: "vehicles",
    label: "車両",
    icon: { focused: "car", unfocused: "car-outline" },
  },
  {
    id: "certificates",
    screenName: "certificates",
    label: "証明",
    icon: { focused: "certificate", unfocused: "certificate-outline" },
  },
  {
    id: "more",
    screenName: "more",
    label: "その他",
    icon: {
      focused: "dots-horizontal-circle-outline",
      unfocused: "dots-horizontal-circle-outline",
    },
  },
] as const;

/** 旧タブで残すがタブバーには表示しない Expo 画面名（href: null で非表示にする） */
export const MOBILE_HIDDEN_SCREENS = ["reservations", "pos"] as const;
