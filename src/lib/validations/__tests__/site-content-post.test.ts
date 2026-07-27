import { describe, it, expect } from "vitest";
import {
  parseSiteContentFormData,
  siteContentPostSchema,
  SITE_CONTENT_STATUSES,
  SITE_CONTENT_STATUS_LABELS,
} from "../site-content-post";

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const base = { type: "news", status: "draft", slug: "reiwa-tora", title: "テスト", body: "本文" };

describe("siteContentPostSchema — CTA/OGP フィールド", () => {
  it("CTA/OGP を FormData→parse→schema で受け取れる（フォームのキー名が一致している）", () => {
    const parsed = siteContentPostSchema.safeParse(
      parseSiteContentFormData(
        fd({
          ...base,
          cta_title: "施工の事実を資産に",
          cta_subtitle: "PoC 受付中",
          cta_primary_label: "PoC・導入を相談する",
          cta_primary_href: "/poc",
          cta_secondary_label: "保険会社の方はこちら",
          cta_secondary_href: "/contact/insurers",
          og_title: "令和の虎に出演",
          og_subtitle: "検証できる世界へ",
        }),
      ),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // 相対パスの href が通る（url() ではなく plain string 検証）
      expect(parsed.data.cta_primary_href).toBe("/poc");
      expect(parsed.data.cta_secondary_href).toBe("/contact/insurers");
      expect(parsed.data.cta_primary_label).toBe("PoC・導入を相談する");
      expect(parsed.data.og_title).toBe("令和の虎に出演");
    }
  });

  it("未入力の CTA/OGP は null（記事側で既定にフォールバック）", () => {
    const parsed = siteContentPostSchema.safeParse(parseSiteContentFormData(fd(base)));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cta_primary_href ?? null).toBeNull();
      expect(parsed.data.og_title ?? null).toBeNull();
    }
  });
});

describe("予約公開（scheduled）", () => {
  it("scheduled が候補にあり、ラベルは「予約」", () => {
    expect(SITE_CONTENT_STATUSES).toContain("scheduled");
    expect(SITE_CONTENT_STATUS_LABELS.scheduled).toBe("予約");
  });

  it("scheduled で公開日時が無いと検証エラー", () => {
    const parsed = siteContentPostSchema.safeParse(
      parseSiteContentFormData(fd({ ...base, status: "scheduled", published_at: "" })),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "published_at")).toBe(true);
    }
  });

  it("scheduled で公開日時があれば通る", () => {
    const parsed = siteContentPostSchema.safeParse(
      parseSiteContentFormData(fd({ ...base, status: "scheduled", published_at: "2026-07-25T18:55" })),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.status).toBe("scheduled");
  });
});
