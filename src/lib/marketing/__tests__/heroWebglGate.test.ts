import { describe, it, expect } from "vitest";
import { isHeroWebglCapable, type HeroWebglEnv } from "../heroWebglGate";

const capable: HeroWebglEnv = {
  hardwareConcurrency: 8,
  deviceMemory: 8,
  isDesktopViewport: true,
  prefersReducedMotion: false,
  saveData: false,
};

describe("isHeroWebglCapable", () => {
  it("十分なスペックのデスクトップでは有効", () => {
    expect(isHeroWebglCapable(capable)).toBe(true);
  });

  it("モバイルビューポートでは常に無効", () => {
    expect(isHeroWebglCapable({ ...capable, isDesktopViewport: false })).toBe(false);
  });

  it("prefers-reduced-motion では無効", () => {
    expect(isHeroWebglCapable({ ...capable, prefersReducedMotion: true })).toBe(false);
  });

  it("データセーバー有効時は無効", () => {
    expect(isHeroWebglCapable({ ...capable, saveData: true })).toBe(false);
  });

  it("コア数 4 未満では無効、取得不能なら許可", () => {
    expect(isHeroWebglCapable({ ...capable, hardwareConcurrency: 2 })).toBe(false);
    expect(isHeroWebglCapable({ ...capable, hardwareConcurrency: undefined })).toBe(true);
  });

  it("deviceMemory 4GB 未満では無効、取得不能 (Safari/Firefox) なら許可", () => {
    expect(isHeroWebglCapable({ ...capable, deviceMemory: 2 })).toBe(false);
    expect(isHeroWebglCapable({ ...capable, deviceMemory: undefined })).toBe(true);
  });
});
