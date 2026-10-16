import { describe, it, expect } from "vitest";
import { directVideoPath, isOwnDirectVideoPath } from "../index";

describe("isOwnDirectVideoPath [直接アップロードした動画の保存パス]", () => {
  it("upload-url が発行する形のパスは通す", () => {
    expect(isOwnDirectVideoPath(directVideoPath("t1", "c1", "mp4", 1700000000000), "t1", "c1")).toBe(true);
    expect(isOwnDirectVideoPath("media/t1/c1/1700000000000_main.mov", "t1", "c1")).toBe(true);
  });
  it("他テナント・他の証明書・別の形のパスは通さない", () => {
    expect(isOwnDirectVideoPath("media/t2/c1/1700000000000_main.mp4", "t1", "c1")).toBe(false);
    expect(isOwnDirectVideoPath("media/t1/c2/1700000000000_main.mp4", "t1", "c1")).toBe(false);
    expect(isOwnDirectVideoPath("media/t1/c1/1700000000000_poster.jpg", "t1", "c1")).toBe(false);
    expect(isOwnDirectVideoPath("media/t1/c1/../c2/1700000000000_main.mp4", "t1", "c1")).toBe(false);
    expect(isOwnDirectVideoPath("tenants/t1/logo.png", "t1", "c1")).toBe(false);
  });
});
