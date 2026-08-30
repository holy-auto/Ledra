import { describe, it, expect } from "vitest";
import { MORE_SECTIONS, MORE_MENU_ITEMS, filterMoreMenuItems, groupMoreMenuItems } from "../moreMenu";
import type { Permission } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/permissions";

// ── ヘルパー ──

/** 指定ロールの can 関数を作る */
function canFor(role: "owner" | "admin" | "staff" | "viewer") {
  return (p: Permission) => hasPermission(role, p);
}

// ── 正準項目 ──

describe("MORE_MENU_ITEMS 正準定義", () => {
  it("全項目に必須フィールドがある", () => {
    for (const item of MORE_MENU_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.section).toBeTruthy();
      expect(item.platforms.length).toBeGreaterThan(0);
      expect(item.webHref).toBeTruthy();
      expect(item.mobileRoute).toBeTruthy();
    }
  });

  it("id が重複しない", () => {
    const ids = MORE_MENU_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("全項目のセクションが MORE_SECTIONS に含まれる", () => {
    for (const item of MORE_MENU_ITEMS) {
      expect(MORE_SECTIONS).toContain(item.section);
    }
  });

  it("sync_center 項目が含まれる（IMP-032 連携）", () => {
    const sync = MORE_MENU_ITEMS.find((i) => i.id === "sync_center");
    expect(sync).toBeDefined();
    expect(sync!.badgeKey).toBe("sync");
    expect(sync!.requiredPermission).toBeNull();
  });

  it("既存モバイル 7 項目が網羅されている", () => {
    // ponytail: 現行 more/index.tsx の 7 項目が正準定義に含まれることを検証
    const mobileItems = MORE_MENU_ITEMS.filter((i) => i.platforms.includes("mobile"));
    const mobileIds = mobileItems.map((i) => i.id);
    // 予約管理, 顧客管理, レジ・会計, NFC, NFCタグ台帳, 店舗ダッシュボード, 設定
    expect(mobileIds).toContain("reservations");
    expect(mobileIds).toContain("customers");
    expect(mobileIds).toContain("pos");
    expect(mobileIds).toContain("nfc_scan");
    expect(mobileIds).toContain("nfc_tags");
    expect(mobileIds).toContain("dashboard");
    expect(mobileIds).toContain("settings");
  });
});

// ── フィルタリング ──

describe("filterMoreMenuItems()", () => {
  it("owner はモバイル全項目を見られる", () => {
    const items = filterMoreMenuItems(canFor("owner"), "mobile");
    const mobileAll = MORE_MENU_ITEMS.filter((i) => i.platforms.includes("mobile"));
    expect(items).toHaveLength(mobileAll.length);
  });

  it("viewer はモバイルで権限不足の項目が除外される", () => {
    const items = filterMoreMenuItems(canFor("viewer"), "mobile");
    // viewer は settings:view を持たない → 設定が見えない
    expect(items.find((i) => i.id === "settings")).toBeUndefined();
    // viewer は register_sessions:operate を持たない → POS が見えない
    expect(items.find((i) => i.id === "pos")).toBeUndefined();
    // viewer は members:view を持たない → メンバー管理が見えない
    expect(items.find((i) => i.id === "members")).toBeUndefined();
  });

  it("sync_center は requiredPermission: null なので全ロールに見える", () => {
    const viewerItems = filterMoreMenuItems(canFor("viewer"), "mobile");
    expect(viewerItems.find((i) => i.id === "sync_center")).toBeDefined();
  });

  it("モバイル専用項目は web に表示されない", () => {
    const webItems = filterMoreMenuItems(canFor("owner"), "web");
    // NFC 系はモバイル専用
    expect(webItems.find((i) => i.id === "nfc_scan")).toBeUndefined();
    expect(webItems.find((i) => i.id === "nfc_tags")).toBeUndefined();
  });

  it("platform フィルタ後も定義順を維持する", () => {
    const items = filterMoreMenuItems(canFor("owner"), "mobile");
    const indices = items.map((i) => MORE_MENU_ITEMS.findIndex((m) => m.id === i.id));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });
});

// ── グループ化 ──

describe("groupMoreMenuItems()", () => {
  it("MORE_SECTIONS の順序でグループ化される", () => {
    const items = filterMoreMenuItems(canFor("owner"), "mobile");
    const groups = groupMoreMenuItems(items);
    const sectionOrder = groups.map((g) => g.section);
    const expectedOrder = [...MORE_SECTIONS].filter((s) => sectionOrder.includes(s));
    expect(sectionOrder).toEqual(expectedOrder);
  });

  it("空セクションは除外される", () => {
    // viewer + web → デバイス・連携セクションは空（NFC はモバイル専用）
    const items = filterMoreMenuItems(canFor("owner"), "web");
    const groups = groupMoreMenuItems(items);
    for (const group of groups) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it("全項目がいずれかのグループに属する", () => {
    const allItems = [...MORE_MENU_ITEMS];
    const groups = groupMoreMenuItems(allItems);
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(allItems.length);
  });
});
