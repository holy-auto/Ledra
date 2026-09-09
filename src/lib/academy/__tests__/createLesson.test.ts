/**
 * lessonCreateSchema の video_url / cover_image_url スキーム制限のテスト。
 *
 * D-A8 是正の回帰確認: `tel:` `sms:` 等の非 http(s) スキームは受け付けない
 * （モバイルの知識共有画面が video_url を Linking.openURL にそのまま渡すため）。
 */
import { describe, it, expect } from "vitest";
import { lessonCreateSchema } from "../createLesson";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "テストレッスン",
    body: "本文本文本文本文本文",
    category: "coating",
    ...overrides,
  };
}

describe("lessonCreateSchema video_url / cover_image_url", () => {
  it("https の video_url は受け付ける", () => {
    const res = lessonCreateSchema.safeParse(baseInput({ video_url: "https://example.com/v.mp4" }));
    expect(res.success).toBe(true);
  });

  it("空文字は受け付ける（任意項目）", () => {
    const res = lessonCreateSchema.safeParse(baseInput({ video_url: "" }));
    expect(res.success).toBe(true);
  });

  it("tel: スキームは拒否する (D-A8 回帰確認)", () => {
    const res = lessonCreateSchema.safeParse(baseInput({ video_url: "tel:0312345678" }));
    expect(res.success).toBe(false);
  });

  it("任意アプリの custom scheme は拒否する", () => {
    const res = lessonCreateSchema.safeParse(baseInput({ video_url: "myapp://evil/action" }));
    expect(res.success).toBe(false);
  });

  it("cover_image_url も同様に非 http(s) を拒否する", () => {
    const res = lessonCreateSchema.safeParse(baseInput({ cover_image_url: "sms:0312345678" }));
    expect(res.success).toBe(false);
  });
});
