import { describe, it, expect, vi, afterEach } from "vitest";
import { clearOfflineReadCache, readCacheInfo, formatCacheAge } from "@/lib/offline-cache/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mkResponse(headers: Record<string, string>): Response {
  return new Response("", { headers });
}

describe("readCacheInfo", () => {
  it("returns fromCache=false when no X-From-Cache header", () => {
    const r = readCacheInfo(mkResponse({}));
    expect(r.fromCache).toBe(false);
    expect(r.ageMs).toBeNull();
  });

  it("parses X-From-Cache and X-Cache-Age-Ms", () => {
    const r = readCacheInfo(mkResponse({ "X-From-Cache": "1", "X-Cache-Age-Ms": "12345" }));
    expect(r.fromCache).toBe(true);
    expect(r.ageMs).toBe(12345);
  });

  it("handles missing age gracefully", () => {
    const r = readCacheInfo(mkResponse({ "X-From-Cache": "1" }));
    expect(r.fromCache).toBe(true);
    expect(r.ageMs).toBeNull();
  });

  it("handles null/undefined response", () => {
    expect(readCacheInfo(null)).toEqual({ fromCache: false, ageMs: null });
    expect(readCacheInfo(undefined)).toEqual({ fromCache: false, ageMs: null });
  });
});

describe("formatCacheAge", () => {
  it("returns empty for null", () => {
    expect(formatCacheAge(null)).toBe("");
  });

  it("uses 'たった今' under 1 minute", () => {
    expect(formatCacheAge(30_000)).toBe("たった今");
    expect(formatCacheAge(59_999)).toBe("たった今");
  });

  it("uses '<n> 分前' for minutes", () => {
    expect(formatCacheAge(60_000)).toBe("1 分前");
    expect(formatCacheAge(59 * 60_000)).toBe("59 分前");
  });

  it("uses '<n> 時間前' for hours", () => {
    expect(formatCacheAge(60 * 60_000)).toBe("1 時間前");
    expect(formatCacheAge(23 * 60 * 60_000)).toBe("23 時間前");
  });

  it("uses '<n> 日前' for days", () => {
    expect(formatCacheAge(24 * 60 * 60_000)).toBe("1 日前");
    expect(formatCacheAge(7 * 24 * 60 * 60_000)).toBe("7 日前");
  });
});

describe("clearOfflineReadCache", () => {
  it("returns false when serviceWorker is unavailable", async () => {
    vi.stubGlobal("navigator", {} as unknown as Navigator);
    const r = await clearOfflineReadCache();
    expect(r).toBe(false);
  });

  it("returns false when no active worker", async () => {
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ active: null }) },
    } as unknown as Navigator);
    const r = await clearOfflineReadCache();
    expect(r).toBe(false);
  });

  it("postMessages to the active SW", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) },
    } as unknown as Navigator);
    const r = await clearOfflineReadCache();
    expect(r).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "clear-offline-cache" });
  });
});
