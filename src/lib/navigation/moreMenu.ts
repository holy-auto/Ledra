/**
 * MORE タブ正準項目定義（IMP-033）。
 *
 * v2.0 §2: モバイル「その他」タブ / Web 設定ハブに表示する項目の
 * 単一定義源。現行の mobile `more/index.tsx` ハードコード 7 項目と
 * Web `settingsHub.ts` の hub 項目を統合する正準レジストリ。
 *
 * 実際の UI コンポーネント変更は消費側の責任（IMP-033 は型基盤のみ）。
 */

import type { Permission } from "@/lib/auth/permissions";

// ── セクション ──

/**
 * MORE メニュー内のセクション。
 *
 * ponytail: Web の HUB_SECTION_ORDER（settingsHub.ts）と意味的に揃えるが、
 * モバイル向けにより粗い分類。将来 UI 側がセクションヘッダを描画するかは
 * 消費側が決める。
 */
export const MORE_SECTIONS = ["業務", "デバイス・連携", "管理", "システム"] as const;
export type MoreSection = (typeof MORE_SECTIONS)[number];

// ── 項目型 ──

export type MoreMenuItem = {
  /** 一意識別子。ルーティングやテストで安定した参照に使う */
  id: string;
  /** UI 表示ラベル */
  label: string;
  /** MaterialCommunityIcons アイコン名（react-native-paper 互換） */
  icon: string;
  /** セクション分類 */
  section: MoreSection;
  /** 表示に必要な権限。null = 誰でも見える */
  requiredPermission: Permission | null;
  /** どのプラットフォームに表示するか */
  platforms: readonly ("mobile" | "web")[];
  /**
   * バッジ表示のキー。
   * UI 側がこのキーで未読数・注意件数を紐づける。
   * ponytail: 具体的なバッジ値の解決は UI 層の責任。
   */
  badgeKey: string | null;
  /** Web での遷移先パス（/admin/...） */
  webHref: string;
  /** Expo モバイルでの遷移先パス */
  mobileRoute: string;
};

// ── 正準項目 ──

/**
 * MORE タブに表示する全項目の正準リスト。
 *
 * 項目の追加・削除・並べ替えはここで一元管理する。
 * 消費側（mobile more/index.tsx, web SettingsHub.tsx）は
 * filterMoreMenuItems() 経由で取得する。
 */
export const MORE_MENU_ITEMS: readonly MoreMenuItem[] = [
  // ── 業務 ──
  {
    id: "reservations",
    label: "予約管理",
    icon: "calendar",
    section: "業務",
    requiredPermission: "reservations:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/reservations",
    mobileRoute: "/reservations",
  },
  {
    id: "customers",
    label: "顧客管理",
    icon: "account-group",
    section: "業務",
    requiredPermission: "customers:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/customers",
    mobileRoute: "/customers",
  },
  {
    id: "pos",
    label: "レジ・会計",
    icon: "cash-register",
    section: "業務",
    requiredPermission: "register_sessions:operate",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/pos",
    mobileRoute: "/pos/register",
  },
  {
    id: "dashboard",
    label: "店舗ダッシュボード",
    icon: "chart-bar",
    section: "業務",
    requiredPermission: "dashboard:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin",
    mobileRoute: "/dashboard",
  },

  // ── デバイス・連携 ──
  {
    id: "nfc_scan",
    label: "NFC",
    icon: "nfc",
    section: "デバイス・連携",
    requiredPermission: "certificates:view",
    platforms: ["mobile"],
    badgeKey: null,
    webHref: "/admin/certificates",
    mobileRoute: "/nfc/scan",
  },
  {
    id: "nfc_tags",
    label: "NFCタグ台帳",
    icon: "tag-multiple",
    section: "デバイス・連携",
    requiredPermission: "certificates:view",
    platforms: ["mobile"],
    badgeKey: null,
    webHref: "/admin/certificates",
    mobileRoute: "/nfc/tags",
  },

  // ── 管理 ──
  {
    id: "settings",
    label: "設定",
    icon: "cog-outline",
    section: "管理",
    requiredPermission: "settings:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/settings",
    mobileRoute: "/settings",
  },
  {
    id: "members",
    label: "メンバー管理",
    icon: "account-multiple",
    section: "管理",
    requiredPermission: "members:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/members",
    mobileRoute: "/members",
  },
  {
    id: "stores",
    label: "店舗管理",
    icon: "store",
    section: "管理",
    requiredPermission: "stores:view",
    platforms: ["mobile", "web"],
    badgeKey: null,
    webHref: "/admin/stores",
    mobileRoute: "/stores",
  },

  // ── システム ──
  {
    id: "sync_center",
    label: "同期センター",
    icon: "sync",
    section: "システム",
    requiredPermission: null,
    platforms: ["mobile", "web"],
    badgeKey: "sync",
    webHref: "/admin/sync",
    mobileRoute: "/sync",
  },
] as const;

// ── フィルタリング ──

/**
 * 権限に基づいて MORE メニュー項目をフィルタリングする。
 *
 * @param can - 権限チェック関数（hasPermission(role, perm) の部分適用）
 * @param platform - 対象プラットフォーム
 * @returns 表示可能な項目の配列（定義順を維持）
 */
export function filterMoreMenuItems(
  can: (permission: Permission) => boolean,
  platform: "mobile" | "web",
): MoreMenuItem[] {
  return MORE_MENU_ITEMS.filter((item) => {
    if (!item.platforms.includes(platform)) return false;
    if (item.requiredPermission && !can(item.requiredPermission)) return false;
    return true;
  });
}

/**
 * セクションごとにグループ化した MORE メニュー項目を返す。
 *
 * ponytail: MORE_SECTIONS の定義順を維持。空セクションは除外。
 */
export function groupMoreMenuItems(items: readonly MoreMenuItem[]): { section: MoreSection; items: MoreMenuItem[] }[] {
  const groups: { section: MoreSection; items: MoreMenuItem[] }[] = [];
  for (const section of MORE_SECTIONS) {
    const sectionItems = items.filter((i) => i.section === section);
    if (sectionItems.length > 0) groups.push({ section, items: sectionItems });
  }
  return groups;
}
