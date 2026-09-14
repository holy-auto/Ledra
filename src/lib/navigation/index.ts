/**
 * ナビゲーション基盤（IMP-020）。
 *
 * v2.0 §2 / §4: 正準タブ定義、Quick Create、ワークスコープの公開 API。
 */

// ── タブ ──
export {
  CANONICAL_TABS,
  WEB_TABS,
  MOBILE_TABS,
  MOBILE_HIDDEN_SCREENS,
  type CanonicalTab,
  type WebTab,
  type MobileTab,
} from "./tabs";

// ── Quick Create ──
export {
  QUICK_CREATE_ACTIONS,
  inferCreateContext,
  applyCreateContext,
  type QuickCreateAction,
  type CreateContext,
} from "./quickCreate";

// ── ワークスコープ ──
export { WORK_SCOPES, WORK_SCOPE_LABELS, availableScopes, defaultScope, type WorkScope } from "./scope";

// ── MORE メニュー (IMP-033) ──
export {
  MORE_SECTIONS,
  MORE_MENU_ITEMS,
  filterMoreMenuItems,
  groupMoreMenuItems,
  type MoreSection,
  type MoreMenuItem,
} from "./moreMenu";

// ── デバイスクラス・タブレットレイアウト (IMP-034) ──
export { BREAKPOINTS, DEVICE_CLASSES, resolveDeviceClass, isMobileOrTablet, type DeviceClass } from "./deviceClass";
export {
  TABLET_PANE_SCREENS,
  resolveLayoutMode,
  findPaneConfig,
  type TabletPaneConfig,
  type LayoutMode,
} from "./tabletLayout";
