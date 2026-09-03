import { describe, it, expect } from "vitest";
import {
  BREAKPOINTS,
  DEVICE_CLASSES,
  resolveDeviceClass,
  isMobileOrTablet,
  TABLET_PANE_SCREENS,
  resolveLayoutMode,
  findPaneConfig,
} from "../index";

// ── デバイスクラス ──

describe("resolveDeviceClass()", () => {
  it("767px → mobile", () => {
    expect(resolveDeviceClass(767)).toBe("mobile");
  });

  it("768px → tablet（ちょうどブレークポイント）", () => {
    expect(resolveDeviceClass(768)).toBe("tablet");
  });

  it("1023px → tablet", () => {
    expect(resolveDeviceClass(1023)).toBe("tablet");
  });

  it("1024px → desktop（ちょうどブレークポイント）", () => {
    expect(resolveDeviceClass(1024)).toBe("desktop");
  });

  it("1920px → desktop", () => {
    expect(resolveDeviceClass(1920)).toBe("desktop");
  });

  it("0px → mobile", () => {
    expect(resolveDeviceClass(0)).toBe("mobile");
  });
});

describe("BREAKPOINTS", () => {
  it("tablet = 768, desktop = 1024（Tailwind md/lg と一致）", () => {
    expect(BREAKPOINTS.tablet).toBe(768);
    expect(BREAKPOINTS.desktop).toBe(1024);
  });
});

describe("DEVICE_CLASSES", () => {
  it("3 段階: mobile / tablet / desktop", () => {
    expect(DEVICE_CLASSES).toEqual(["mobile", "tablet", "desktop"]);
  });
});

describe("isMobileOrTablet()", () => {
  it("mobile → true", () => {
    expect(isMobileOrTablet("mobile")).toBe(true);
  });

  it("tablet → true", () => {
    expect(isMobileOrTablet("tablet")).toBe(true);
  });

  it("desktop → false", () => {
    expect(isMobileOrTablet("desktop")).toBe(false);
  });
});

// ── タブレット 2-pane ──

describe("TABLET_PANE_SCREENS", () => {
  it("全ペアに必須フィールドがある", () => {
    for (const config of TABLET_PANE_SCREENS) {
      expect(config.id).toBeTruthy();
      expect(config.listLabel).toBeTruthy();
      expect(config.detailLabel).toBeTruthy();
      expect(config.listRatio).toBeGreaterThan(0);
      expect(config.listRatio).toBeLessThan(1);
      expect(config.listHref).toMatch(/^\/admin\//);
      expect(config.detailHrefPattern).toContain("[id]");
    }
  });

  it("id が重複しない", () => {
    const ids = TABLET_PANE_SCREENS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("作業 / 車両 / 証明書 / 顧客の 4 ペアが定義されている", () => {
    const ids = TABLET_PANE_SCREENS.map((c) => c.id);
    expect(ids).toContain("work");
    expect(ids).toContain("vehicles");
    expect(ids).toContain("certificates");
    expect(ids).toContain("customers");
  });
});

describe("findPaneConfig()", () => {
  it("一覧パスでマッチ", () => {
    expect(findPaneConfig("/admin/reservations")?.id).toBe("work");
  });

  it("詳細パスでもマッチ（prefix）", () => {
    expect(findPaneConfig("/admin/reservations/abc-123")?.id).toBe("work");
  });

  it("未対応パスは null", () => {
    expect(findPaneConfig("/admin/settings")).toBeNull();
  });

  it("ダッシュボードは null（2-pane 非対応）", () => {
    expect(findPaneConfig("/admin")).toBeNull();
  });
});

describe("resolveLayoutMode()", () => {
  it("tablet + 対応画面 → split", () => {
    expect(resolveLayoutMode("tablet", "/admin/reservations")).toBe("split");
  });

  it("tablet + 非対応画面 → single", () => {
    expect(resolveLayoutMode("tablet", "/admin/settings")).toBe("single");
  });

  it("desktop → 常に single", () => {
    expect(resolveLayoutMode("desktop", "/admin/reservations")).toBe("single");
  });

  it("mobile → 常に single", () => {
    expect(resolveLayoutMode("mobile", "/admin/reservations")).toBe("single");
  });
});
